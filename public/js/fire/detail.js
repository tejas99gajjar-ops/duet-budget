// Screen: FIRE Detail. Tabs: Target, Projection, Gap (method 1), Monte Carlo (method 2), Scenarios (method 3).
import { h, raw, bind, IC, chip, statusChip, tile, note, bar, head, fxNav, srcChip, openForm, openNumber, openInfo, toast, undoToast } from './ui.js';
import { html } from '../core.js';
import * as FS from './store.js';
import * as X from './ctx.js';
import { CLASS_INFO, CLASSES, GROUPS, GROUP_LABEL } from './defaults.js';
import { inr, inrC, inrF, pc, pp, yrs } from './format.js';
import { projectionBars, stackedBars, lineChart, tornado } from './charts.js';
import { pickRetireAge, toggleBasis } from './actions.js';
import { openWhatIf } from './whatif.js';
import { sensitivity, runPlan, loanProjection } from './engine.js';

const TABS = [['target', 'Target'], ['projection', 'Projection'], ['gap', 'Gap'], ['montecarlo', 'Monte Carlo'], ['scenarios', 'Scenarios']];
const view = { target: 'chart', projection: 'milestones' };
const GROUP_COLOR = { general: '#7C5FE6', medical: '#1DDB97', education: '#E879A0', housing: '#3B82F6' };

export async function detail(root, { parts }) {
  const tab = parts[0] || 'target';
  if (tab === 'calc') return (await import('./calc.js')).calc(root);
  const plan = X.getPlan(), res = X.run();
  const title = tab === 'montecarlo' ? 'Monte Carlo' : tab === 'scenarios' ? 'Scenarios' : plan.name;
  const right = tab === 'scenarios' ? h`<button class="fx-btn small" data-act="newscen">+ New</button>` : h`<button class="fx-ib" data-act="basis"><span class="dot"></span>${X.basisLabel()}</button>`;
  let body, after = () => {};
  if (tab === 'target') ({ body, after } = targetTab(plan, res));
  else if (tab === 'projection') ({ body, after } = projectionTab(plan, res));
  else if (tab === 'gap') ({ body, after } = gapTab(plan, res));
  else if (tab === 'montecarlo') { const m = await import('./detail-mc.js'); ({ body, after } = m.mcTab(plan, res)); }
  else { const m = await import('./detail-scen.js'); ({ body, after } = m.scenariosTab(plan, res)); }
  html(root, h`<div class="fx">${head({ kicker: 'FIRE DETAIL', title, back: '#/fire', right })}
    <div class="fx-tabs" role="tablist">${TABS.map(([id, label]) => h`<a href="#/fire/detail/${id}" class="${id === tab ? 'on' : ''}" role="tab">${label}</a>`)}</div>
    <div class="col" style="gap:14px">${body}</div>
    <div class="fx-sub center" style="padding:4px 10px">Estimates from your assumptions. Not financial, tax or legal advice.</div>${fxNav('overview')}</div>`);
  bind(root, { click: { basis: () => toggleBasis(), newscen: () => import('./detail-scen.js').then((m) => m.editScenario()), ...(after.clicks || {}) }, input: after.inputs || {}, change: after.changes || {} });
  after.mount?.(root);
}

// ------------------------------------------------------------------------------------------ Target
function targetTab(plan, res) {
  const C = (v) => X.conv(v, res), t = res.target, m = res.meta, A = plan.assumptions, a = m.retireAge;
  const ages = [a - 2, a, a + 2].filter((x) => x > m.ageNow), tot = Object.fromEntries(ages.map((x) => [x, X.run({ retireAge: x }).target.total])); const maxT = Math.max(...Object.values(tot), 1);
  const inflF = Math.pow(1 + m.infl, m.yearsToRet), shares = res.model.shares;
  const rows = t.rows, sample = rows.filter((_, i) => i % 3 === 0 || i === rows.length - 1);
  const chart = stackedBars(sample.map((r) => ({ label: String(r.age), parts: GROUPS.map((g) => ({ v: r.byGroup[g], color: GROUP_COLOR[g] })).concat([{ v: Math.max(0, r.premiums + r.events - r.passive), color: '#8B97B3' }]) })), { w: 340, h: 190 });
  const tableHtml = h`<div class="fx-scroll"><table class="fx-table"><thead><tr><th>Age</th><th>General</th><th>Medical</th><th>Educ.</th><th>Housing</th><th>Net</th><th>Total</th><th>PV</th></tr></thead><tbody>${rows.map((r) => h`<tr><td>${r.age}</td><td>${inrC(r.byGroup.general)}</td><td>${inrC(r.byGroup.medical)}</td><td>${inrC(r.byGroup.education)}</td><td>${inrC(r.byGroup.housing)}</td><td>${inrC(r.net)}</td><td>${inrC(r.gross)}</td><td>${inrC(r.pv)}</td></tr>`)}</tbody></table></div>`;
  const body = h`
    <div class="fx-card glow"><div class="fx-sub">Your FIRE number · ${X.basis() === 'nominal' ? `${m.retireYear} rupees` : "today's money"}</div><div class="fx-big" style="margin:6px 0 10px">${inr(C(t.total))}</div>
      <div class="fx-sub" style="color:var(--text);font-size:15px;line-height:1.45">This is what your pots must hold on the day you retire to fund spending of <b>${inrC(t.annualToday)}/yr</b> (growing with inflation) until age ${m.horizonAge}. The classic ${t.swr}% rule gives <b>${inr(C(t.classicAt))}</b>.</div>
      <div class="fx-row" style="margin-top:12px;gap:10px">${srcChip(plan.spending.retirement?.monthly != null ? 'entered' : 'est')}<span class="fx-sub">Based on your spending input</span></div>
      <button class="fx-link" data-act="calc" style="margin-top:12px">Show detailed calculation →</button></div>
    <div class="fx-card"><h3>Retirement age</h3><div class="fx-row fx-between" style="margin:14px 0 6px"><div class="fx-step"><button data-act="age" data-d="-1" aria-label="Earlier">−</button></div><div class="center"><div class="fx-big pur" style="font-size:54px">${a}</div><div class="fx-sub">${m.retireYear} · ${yrs(m.yearsToRet)}</div></div><div class="fx-step"><button data-act="age" data-d="1" aria-label="Later">+</button></div></div>
      <div class="col" style="gap:10px;margin-top:10px">${ages.map((x) => { const d = tot[x] - t.total; const cur = x === a; return h`<div class="fx-row" style="gap:10px"><span style="width:62px;font-weight:${cur ? 800 : 500};color:${cur ? 'var(--fx2)' : 'var(--muted)'}">Age ${x}</span><div class="fx-bar grow" style="--fill:${cur ? 'var(--fx)' : d > 0 ? 'var(--fx-bad)' : 'var(--fx-ok)'}"><i style="width:${(tot[x] / maxT) * 100}%"></i></div><b style="width:96px;text-align:right;color:${cur ? 'var(--fx2)' : d > 0 ? 'var(--fx-bad)' : 'var(--fx-ok)'}">${cur ? `${inrC(C(tot[x]))} ←` : `${inrC(Math.abs(C(d)))} ${d > 0 ? 'more' : 'less'}`}</b></div>`; })}</div></div>
    <div class="fx-card"><div class="fx-ch"><h3>Annual spending target</h3>${srcChip(plan.spending.retirement?.monthly != null ? 'entered' : 'est')}</div><div class="fx-big" style="font-size:clamp(26px,8vw,36px)">${inrC(t.annualToday).replace('L', ' lakh').replace('Cr', ' crore')}<span class="fx-sub" style="font-size:18px">/yr</span></div>
      <div class="fx-sub" style="margin:6px 0 12px">= ${inrC(t.monthlyToday)}/month today · adjusting for ${A.inflation.general}% inflation to ${m.retireYear}</div>
      <div class="fx-grid2">${tile(`In ${m.retireYear} rupees`, `${inrC(t.annualToday * inflF)}/yr`)}${tile(`Per month (${m.retireYear})`, inrC(t.monthlyToday * inflF))}</div>
      <a class="fx-btn ghost" href="#/fire/inputs/spending" style="margin-top:12px;font-size:15px;padding:13px">Edit spending breakdown →</a></div>
    <div class="fx-card"><div class="fx-row fx-between" style="align-items:flex-start"><div><h3>Safe withdrawal rate</h3><div class="fx-sub" style="margin-top:4px">${A.swr}% = ${A.swr <= 3.5 ? 'conservative for India inflation' : 'more aggressive for a long retirement'}</div></div><div class="fx-right"><div class="fx-big pur" style="font-size:30px">${A.swr}%</div>${A.swr === 3.5 ? chip('def', 'Default') : chip('entered', 'You set')}</div></div>
      <div class="fx-chips" style="margin-top:14px">${(A.swrChoices || [3, 3.25, 3.5]).map((r) => h`<button class="fx-opt ${r === A.swr ? 'on' : ''}" data-act="swr" data-r="${r}">${r}% · ${inrC(C(t.classic[r]))}</button>`)}<button class="fx-opt" data-act="swrc">Custom</button></div></div>
    <div class="fx-card"><div class="fx-ch"><h3>Spending each year of retirement</h3><div class="fx-seg sm"><button class="${view.target === 'chart' ? 'on' : ''}" data-act="tview" data-v="chart">Chart</button><button class="${view.target === 'table' ? 'on' : ''}" data-act="tview" data-v="table">Table</button></div></div>
      ${view.target === 'chart' ? h`${chart}<div class="fx-legend" style="margin-top:8px">${GROUPS.map((g) => h`<span><i style="background:${GROUP_COLOR[g]}"></i>${GROUP_LABEL[g]}</span>`)}<span><i style="background:#8B97B3"></i>Premiums & events</span></div>` : tableHtml}
      <div class="fx-sub" style="margin-top:8px">Each year is in ${X.basis() === 'nominal' ? 'nominal' : "today's"} rupees, grossed up for tax, to age ${m.horizonAge}. PV = value at retirement.</div></div>
    <div class="fx-card"><h3 style="margin-bottom:12px">Cost groups</h3><div class="fx-grid2">${GROUPS.map((g) => h`<button class="fx-tile" data-act="infl" data-g="${g}" style="text-align:left"><div class="l">${GROUP_LABEL[g]}</div><div class="v" style="color:${GROUP_COLOR[g]}">${inrC(t.monthlyToday * (shares[g] || 0))}/mo</div><div class="s">${A.inflation[g]}% inflation · ${pc(shares[g] || 0)}</div></button>`)}</div></div>
    <div class="fx-card"><div class="fx-ch"><h3>Housing in retirement</h3></div><div class="fx-seg">${[['rent', 'Renting'], ['own', 'Own house'], ['custom', 'Custom']].map(([k, l]) => h`<button class="${(plan.spending.housing || 'rent') === k ? 'on' : ''}" data-act="housing" data-k="${k}">${l}</button>`)}</div><div class="fx-sub" style="margin-top:8px">${(plan.spending.housing || 'rent') === 'own' ? 'An owned house removes rent and keeps only upkeep (25% of today\'s rent).' : (plan.spending.housing || 'rent') === 'custom' ? `Housing costs ${inrC(plan.spending.housingMonthly || 0)} a month in today's money.` : 'Rent keeps rising with housing inflation.'}</div></div>
    <div class="fx-card"><div class="fx-ch"><h3>Life expectancy</h3><b class="pur" id="lifev">${m.horizonAge}</b></div><input type="range" class="fx-slider" data-act="life" id="life" min="70" max="100" step="1" value="${m.horizonAge}" aria-label="Life expectancy"><div class="fx-sub">The corpus must last to this age. ${m.horizonAge - m.retireAge} years in retirement.</div></div>`;
  return { body, after: {
    clicks: {
      calc: () => { location.hash = '#/fire/detail/calc'; }, age: (el) => FS.edit('profile', (p) => { p.people[0].retireAge = Math.max(m.ageNow + 1, Math.min(70, m.retireAge + Number(el.dataset.d))); return p; }, { immediate: true }),
      swr: (el) => FS.edit('assumptions', (x) => { x.swr = Number(el.dataset.r); return x; }, { immediate: true }),
      swrc: () => openForm({ title: 'Safe withdrawal rate', sub: 'Between 2% and 6%. Lower is safer for a long retirement.', fields: [{ name: 'swr', label: 'Rate', type: 'pct', required: true, min: 2, max: 6 }], values: { swr: A.swr }, onSave: (v) => FS.edit('assumptions', (x) => { x.swr = v.swr; return x; }, { immediate: true }) }),
      tview: (el) => { view.target = el.dataset.v; X.redraw(); },
      housing: (el) => { const k = el.dataset.k; if (k === 'custom') openForm({ title: 'Housing cost in retirement', fields: [{ name: 'm', label: 'Per month, today\'s money', type: 'money', required: true, min: 0 }], values: { m: plan.spending.housingMonthly || 0 }, onSave: (v) => FS.edit('spending', (s) => { s.housing = 'custom'; s.housingMonthly = v.m; return s; }, { immediate: true }) }); else FS.edit('spending', (s) => { s.housing = k; return s; }, { immediate: true }); },
      infl: (el) => { const g = el.dataset.g; openForm({ title: `${GROUP_LABEL[g]} inflation`, sub: 'Yearly price rise for this kind of cost', fields: [{ name: 'v', label: 'Inflation', type: 'pct', required: true, min: 0, max: 20 }], values: { v: A.inflation[g] }, onSave: (v) => FS.edit('assumptions', (x) => { x.inflation[g] = v.v; return x; }, { immediate: true }) }); },
    },
    changes: { life: (el) => FS.edit('profile', (p) => { p.horizonAge = Number(el.value); return p; }, { immediate: true }) },
    inputs: { life: (el) => { const n = document.getElementById('lifev'); if (n) n.textContent = el.value; } },
  } };
}

// ------------------------------------------------------------------------------------------ Projection
function projectionTab(plan, res) {
  const C = (v) => X.conv(v, res), g = res.gap, m = res.meta, proj = res.projection, A = plan.assumptions;
  const a0 = Math.max(45, m.ageNow + 1), grid = X.grid({}, a0, 70), earliest = X.earliestAge(grid);
  const pre = proj.rows.filter((r) => r.corpus != null).map((r) => ({ year: r.year, corpus: C(r.corpus) }));
  const postRows = res.post.rows.filter((r) => r.year <= m.retireYear + 10).map((r) => ({ year: r.year, corpus: C(Math.max(0, r.corpus)) }));
  const bars = [...pre, ...postRows].filter((_, i, a) => a.length <= 26 || i % 2 === 0 || a[i].year === m.retireYear);
  const rowsAll = proj.rows.filter((r) => r.year < m.retireYear);
  const stack = stackedBars(rowsAll.filter((_, i) => i % Math.max(1, Math.ceil(rowsAll.length / 14)) === 0).map((r) => ({ label: String(r.year).slice(2), parts: CLASSES.map((c) => ({ v: r.classes[c], color: CLASS_INFO[c].color })) })), { w: 340, h: 180 });
  const hitYear = proj.rows.find((r) => r.corpus != null && r.corpus >= g.target)?.year;
  const ms = [...new Set([proj.rows[0]?.year, proj.rows[Math.min(proj.rows.length - 1, 4)]?.year, m.retireYear - 1, hitYear].filter(Boolean))].sort();
  const sip = res.meta.sipNow, savingRate = rowsAll.map((r) => (r.income ? Math.max(0, r.saving / r.income) : 0));
  const full = view.projection === 'full';
  const fill = g.pct >= 1 ? 'var(--fx-ok)' : 'linear-gradient(90deg,var(--fx-ok),var(--fx-warn))';
  const body = h`
    <div class="fx-card"><div class="fx-row fx-between" style="align-items:flex-start"><div><div class="fx-sub">Deterministic result</div><div class="fx-mid ${g.amount > 0 ? 'warn' : 'ok'}" style="margin-top:4px">${earliest ? `Retire age ${earliest}` : 'Not by age 70'}</div></div>${g.amount > 0 ? h`<span class="fx-chip warn" style="font-size:13px">${inrC(C(g.amount))} short at ${m.retireAge}</span>` : h`<span class="fx-chip ok" style="font-size:13px">${inrC(C(-g.amount))} ahead at ${m.retireAge}</span>`}</div>
      <div style="margin-top:14px">${bar(Math.min(1, g.pct), fill)}<div class="fx-row fx-between fx-sub" style="margin-top:6px;gap:6px"><span>Today · ${inrC(proj.potsTotal)}</span><span class="${g.pct >= 1 ? 'ok' : 'warn'}" style="font-weight:700">${pc(g.pct)} funded at ${m.retireAge}</span><span>Target · ${inrC(C(g.target))}</span></div></div></div>
    <div class="fx-card"><div class="fx-ch"><h3>Corpus projection</h3><span class="fx-sub">${m.baseYear}–${(bars[bars.length - 1] || {}).year}</span></div>${projectionBars(bars, C(g.target), { retireYear: m.retireYear })}
      <div class="fx-legend" style="margin-top:8px"><span><i style="background:var(--fx-warn)"></i>Projected</span><span><i style="background:var(--fx2);height:2px;margin-bottom:3px"></i>Target ${inrC(C(g.target))}</span><span><i style="background:var(--fx-ok)"></i>Post-target</span></div></div>
    <div class="fx-card"><div class="fx-ch"><h3>${full ? 'Every year' : 'Year-by-year · key milestones'}</h3><div class="fx-seg sm"><button class="${!full ? 'on' : ''}" data-act="pview" data-v="milestones">Key</button><button class="${full ? 'on' : ''}" data-act="pview" data-v="full">All</button></div></div>
      ${full ? h`<div class="fx-scroll"><table class="fx-table"><thead><tr><th>Year</th><th>Age</th><th>Income</th><th>Spend</th><th>EMIs</th><th>Events</th><th>Saving</th><th>Corpus</th></tr></thead><tbody>${proj.rows.filter((r) => r.corpus != null).map((r) => h`<tr class="${r.year === m.retireYear - 1 ? 'hi' : ''}"><td>${r.year}</td><td>${r.age}</td><td>${inrC(r.income)}</td><td>${inrC(r.spending)}</td><td>${inrC(r.emi)}</td><td>${inrC(r.events)}</td><td>${inrC(r.saving)}</td><td>${inrC(C(r.corpus))}</td></tr>`)}</tbody></table></div>`
        : h`<table class="fx-table"><thead><tr><th>Year</th><th>Age</th><th>Corpus</th><th>Saved</th></tr></thead><tbody>${ms.map((y) => { const r = proj.rows.find((x) => x.year === y); if (!r) return ''; const ret = y === m.retireYear - 1; return h`<tr class="${ret ? 'hi' : ''}"><td>${y + (ret ? 1 : 0)} ${ret ? '🎯' : ''}</td><td>${r.age + (ret ? 1 : 0)}</td><td>${inrC(C(r.corpus))}${r.corpus >= g.target ? ' ✓' : ''}</td><td class="${ret ? '' : 'ok'}">${ret ? `${inrC(r.saving / 12)}/mo` : inrC(r.saving)}</td></tr>`; })}</tbody></table>`}</div>
    <div class="fx-card"><div class="fx-row fx-between" style="align-items:flex-start"><div><h3>Monthly investment</h3><div class="fx-big" style="font-size:clamp(26px,8vw,34px);margin:6px 0">${inrF(sip)}</div><div class="fx-sub">${pp(A.salaryGrowth)} step-up / year · SIPs, EPF and NPS</div></div><div class="fx-right">${srcChip(plan.holdings.some((x) => x.linkedWalletId != null) ? 'duet' : 'entered')}<a class="fx-btn small ghost" href="#/fire/inputs/assets" style="margin-top:10px">Edit</a></div></div></div>
    <div class="fx-card"><h3 style="margin-bottom:10px">Where the money sits, year by year</h3>${stack}<div class="fx-legend" style="margin-top:8px">${CLASSES.filter((c) => proj.potsToday[c] > 0 || rowsAll.some((r) => r.classes[c] > 0)).map((c) => h`<span><i style="background:${CLASS_INFO[c].color}"></i>${CLASS_INFO[c].short}</span>`)}</div></div>
    <div class="fx-card"><h3 style="margin-bottom:6px">Saving as a share of income</h3>${savingRate.length > 1 ? lineChart(savingRate, rowsAll.map((r) => String(r.year).slice(2)), { color: 'var(--fx2)', pct: true, yMin: 0 }) : h`<div class="fx-sub">Add income and savings to see this.</div>`}<div class="fx-sub" style="margin-top:6px">Income grows near ${A.salaryGrowth}% while costs grow near ${A.inflation.general}%, so saving power shrinks in real terms unless pay rises faster.</div></div>
    <div class="fx-card"><h3 style="margin-bottom:10px">What counts</h3><div class="col" style="gap:14px">${[['includeFamilyFunds', "Count family-held funds", "Funds held in a parent's name"], ['includeHouse', 'Count property as an asset', 'Off by default: a house you live in does not pay bills'], ['investSurplus', 'Invest unallocated monthly surplus', 'Income left after spending, EMIs and SIPs'], ['redirectFreedEmi', 'Invest EMIs once loans end', 'Freed EMI becomes extra investing']].map(([k, l, d]) => h`<div class="fx-row fx-between" style="gap:12px"><div><b>${l}</b><div class="fx-sub">${d}</div></div><button class="fx-toggle ${A[k] !== false && A[k] ? 'on' : ''}" role="switch" aria-checked="${!!A[k]}" data-act="opt" data-k="${k}"></button></div>`)}</div></div>
    <div class="fx-card"><h3 style="margin-bottom:10px">Pots today</h3><div class="fx-list">${CLASSES.filter((c) => proj.potsToday[c] > 0).map((c) => { const hs = plan.holdings.filter((x) => (x.assetClass === c || (x.mix || []).some((y) => y.cls === c)) && x.include !== false); const sips = hs.reduce((s, x) => s + (x.sips || []).filter((y) => y.status !== 'paused' && y.status !== 'stopped').reduce((q, y) => q + (Number(y.amount) || 0), 0), 0); return h`<a class="fx-li" href="#/fire/inputs/assets"><span class="fx-dot" style="background:${CLASS_INFO[c].color}"></span><span class="grow"><b>${CLASS_INFO[c].label}</b><div class="fx-sub">${inrC(sips)}/mo · ${A.returns[c]}% return</div></span><b>${inrC(proj.potsToday[c])}</b></a>`; })}</div></div>`;
  return { body, after: { clicks: { pview: (el) => { view.projection = el.dataset.v; X.redraw(); }, opt: (el) => FS.edit('assumptions', (x) => { x[el.dataset.k] = !x[el.dataset.k]; return x; }, { immediate: true }) } } };
}

// ------------------------------------------------------------------------------------------ Gap
function gapTab(plan, res) {
  const C = (v) => X.conv(v, res), g = res.gap, m = res.meta, short = g.amount > 0, cl = X.close();
  const cur = Math.round(m.sipNow), extra = cl.extraMonthly ? Math.round(cl.extraMonthly) : 0, maxExtra = Math.max(150000, Math.round(extra * 2 / 5000) * 5000);
  const earnD = cl.earnMoreDelta != null ? Math.ceil(cl.earnMoreDelta * 2) / 2 : null, base = plan.assumptions.salaryGrowth;
  const monthly = res.target.monthlyToday, cut = cl.lowerSpendPossible ? Math.ceil(cl.lowerSpend / 500) * 500 : 0;
  const rowsPre = res.projection.rows.filter((r) => r.corpus != null), sample = rowsPre.filter((_, i) => i % Math.max(1, Math.ceil(rowsPre.length / 5)) === 0).slice(0, 6);
  const pairChart = stackedBarsPaired(sample, extra);
  const loans = plan.loans.filter((l) => l.status !== 'closed' && l.status !== 'planned' && Number(l.outstanding ?? l.principal) > 0);
  const tenure = loans.map((l) => ({ l, rows: [7, 10, 12, 15].map((y) => { const p2 = { ...plan, loans: plan.loans.map((x) => (x.id === l.id ? { ...x, emi: undefined, endDate: undefined, tenureMonths: y * 12 } : x)) }; const r = X.run({}, p2), lp = loanProjection({ ...l, emi: undefined, endDate: undefined, tenureMonths: y * 12 }, X.today()); return { y, emi: lp.emi, free: r.meta.takeHome - r.meta.spendNow - lp.emi - r.meta.sipTake, gap: r.gap.amount }; }) }));
  const sens = sensitivity(plan, { today: X.today() });
  const lever = (k, icon, title, sub, big, bigSub, min, max, step, value, curLab, tgtLab, maxLab, color) => h`<div class="fx-card"><div class="fx-row fx-between" style="align-items:flex-start"><div><b style="font-size:17px">${icon} ${title}</b><div class="fx-sub" style="margin-top:2px">${sub}</div></div><div class="fx-right"><div class="fx-mid" style="color:${color}" data-big="${k}">${big}</div><div class="fx-sub">${bigSub}</div></div></div>
    <input type="range" class="fx-slider" data-act="lv" data-lv="${k}" min="${min}" max="${max}" step="${step}" value="${value}" style="accent-color:${color};margin-top:12px" aria-label="${title}"><div class="fx-row fx-between fx-sub" style="gap:6px"><span>${curLab}</span><b style="color:${color}" data-tgt="${k}">${tgtLab}</b><span>${maxLab}</span></div>
    <div class="fx-row fx-between" style="margin-top:10px;gap:10px"><span class="fx-sub" data-after="${k}"></span><button class="fx-btn small" data-act="apply" data-k="${k}">Apply</button></div></div>`;
  const body = h`
    <div class="fx-card ${short ? 'bad' : 'good'}"><div class="${short ? 'bad' : 'ok'}" style="font-weight:800;letter-spacing:.06em;text-transform:uppercase;font-size:13px">${short ? '⚠ Shortfall' : '✓ Surplus'} at age ${m.retireAge}</div><div class="fx-big ${short ? 'bad' : 'ok'}" style="margin:6px 0 8px">${inr(C(Math.abs(g.amount)))}</div>
      <div class="fx-sub" style="color:var(--text);font-size:15px;line-height:1.45">${short ? `Your pots will reach ${inr(C(g.projected))} by ${m.retireYear} but you need ${inr(C(g.target))}. Four levers can close this gap.` : `Your pots will reach ${inr(C(g.projected))} by ${m.retireYear}, ${inr(C(-g.amount))} more than the ${inr(C(g.target))} you need.`}</div>
      <button class="fx-link" data-act="calc" style="margin-top:10px">Show detailed calculation →</button></div>
    ${short ? h`${lever('save', '💰', 'Save more', 'Increase monthly investments', `+${inrC(extra)}`, '/month needed', 0, maxExtra, 1000, extra, `${inrC(cur)} current`, `${inrC(cur + extra)} target`, `${inrC(cur + maxExtra)} max`, 'var(--fx-ok)')}
      ${earnD != null ? lever('earn', '📈', 'Earn more', 'Higher income and saving growth', `+${earnD}%`, 'income growth/yr', 0, 15, 0.5, earnD, `${base}% base`, `${base + earnD}% needed`, `${base + 15}% max`, 'var(--fx2)') : h`<div class="fx-card ghost"><b>📈 Earn more</b><div class="fx-sub">Even 15% extra yearly growth does not close this gap on its own.</div></div>`}
      ${cl.lowerSpendPossible ? lever('spend', '✂️', 'Spend less', 'Reduce retirement spending', `− ${inrC(cut)}`, '/month at retirement', 0, Math.round(monthly * 0.5 / 500) * 500, 500, cut, `${inrC(monthly)} current`, `${inrC(monthly - cut)} new target`, `${inrC(monthly * 0.5)} min`, 'var(--fx-warn)') : h`<div class="fx-card ghost"><b>✂️ Spend less</b><div class="fx-sub">Cutting spending alone cannot close this gap.</div></div>`}
      <div class="fx-card"><div class="fx-row fx-between" style="gap:10px"><div><b style="font-size:17px">⏳ Retire later</b><div class="fx-sub">The earliest age at which the gap closes</div></div><div class="fx-right"><div class="fx-mid warn">${cl.laterAge ? `Age ${cl.laterAge}` : '70+'}</div>${cl.laterAge ? h`<button class="fx-link" data-act="applyage" data-a="${cl.laterAge}" style="margin-top:4px">Set this age</button>` : ''}</div></div>
        ${cl.higherReturnDelta != null ? h`<div class="fx-sub" style="margin-top:10px">Or earn about <b>${cl.higherReturnDelta.toFixed(1)} points</b> more a year on equity, hybrid, debt and NPS (not something you control).</div>` : ''}</div>` : ''}
    <div class="fx-card"><h3 style="margin-bottom:10px">Monthly savings projection</h3>${pairChart}<div class="fx-legend" style="margin-top:8px"><span><i style="background:var(--fx)"></i>Planned</span><span><i style="background:var(--fx-ok)"></i>Needed to close the gap</span></div></div>
    <div class="fx-card"><div class="fx-ch"><h3>Goal by goal</h3><a class="fx-link" href="#/fire/goals">Manage →</a></div><div class="fx-scroll"><table class="fx-table"><thead><tr><th>Goal</th><th>Needed</th><th>Funded</th><th>Gap</th><th>%</th></tr></thead><tbody>${res.goals.map((x) => h`<tr><td>${x.icon} ${x.name}</td><td>${inrC(x.needed)}</td><td>${inrC(x.funded)}</td><td class="${x.gap > 0 ? 'bad' : 'ok'}">${x.gap > 0 ? inrC(x.gap) : `+${inrC(-x.gap)}`}</td><td>${pc(x.pct)}</td></tr>`)}</tbody></table></div></div>
    <div class="fx-card"><h3>What moves the gap most</h3><div class="fx-sub" style="margin:4px 0 8px">Each bar shows how the gap changes when one thing moves up or down. Green = smaller gap.</div>${tornado(sens, g.amount)}</div>
    ${tenure.map(({ l, rows }) => h`<div class="fx-card"><h3>${l.name}: how long to repay?</h3><div class="fx-sub" style="margin:4px 0 8px">Longer tenure lowers the EMI and frees cash, but costs more interest.</div><div class="fx-scroll"><table class="fx-table"><thead><tr><th>Years</th><th>EMI</th><th>Free cash/mo</th><th>Gap</th><th></th></tr></thead><tbody>${rows.map((r) => h`<tr><td>${r.y}</td><td>${inrC(r.emi)}</td><td class="${r.free < 0 ? 'bad' : ''}">${inrC(r.free)}</td><td class="${r.gap > 0 ? 'bad' : 'ok'}">${r.gap > 0 ? inrC(C(r.gap)) : `+${inrC(C(-r.gap))}`}</td><td><button class="fx-link" data-act="tenure" data-l="${l.id}" data-y="${r.y}">Use</button></td></tr>`)}</tbody></table></div></div>`)}`;
  const opts = (k, v) => ({ save: { extraMonthly: v }, earn: { incomeGrowthDeltaPct: v }, spend: { spendCutMonthly: v } }[k]);
  const after = { clicks: {
    calc: () => { location.hash = '#/fire/detail/calc'; },
    apply: (el) => { const k = el.dataset.k, v = Number(document.querySelector(`[data-lv="${k}"]`).value); if (!v) return toast('Move the slider first'); openWhatIf(k === 'save' ? { extraMonthly: v } : k === 'earn' ? { incomeGrowthDeltaPct: v } : { spendCutMonthly: v }); },
    applyage: (el) => FS.edit('profile', (p) => { p.people[0].retireAge = Number(el.dataset.a); return p; }, { immediate: true }),
    tenure: (el) => { const lid = el.dataset.l, y = Number(el.dataset.y); FS.edit('loans', (ls) => ls.map((x) => (x.id === lid ? { ...x, emi: undefined, endDate: undefined, tenureMonths: y * 12 } : x)), { immediate: true }); undoToast(`Tenure set to ${y} years`, () => FS.undo()); },
  }, inputs: { lv: (el) => { const k = el.dataset.lv, v = Number(el.value), r = X.run({ overrides: opts(k, v) }), root = el.closest('.fx-card'); const t = root.querySelector(`[data-tgt="${k}"]`), a = root.querySelector(`[data-after="${k}"]`), b = root.querySelector(`[data-big="${k}"]`);
    if (k === 'save') { t.textContent = `${inrC(cur + v)} target`; b.textContent = `+${inrC(v)}`; } else if (k === 'earn') { t.textContent = `${(base + v).toFixed(1)}% needed`; b.textContent = `+${v}%`; } else { t.textContent = `${inrC(monthly - v)} new target`; b.textContent = `− ${inrC(v)}`; }
    a.innerHTML = r.gap.amount > 0 ? `Gap after this: <b class="bad">${inr(C(r.gap.amount))}</b>` : `Gap closed, <b class="ok">${inr(C(-r.gap.amount))}</b> to spare`; } } };
  after.mount = (root) => { for (const el of root.querySelectorAll('[data-lv]')) after.inputs.lv(el); };
  return { body, after };
}

/** Planned saving per year (purple) next to the saving needed to close the gap (green). */
function stackedBarsPaired(rows, extraMonthly) {
  const w = 340, hh = 170, padL = 44, padB = 24, padT = 10, iw = w - padL - 8, ih = hh - padT - padB; if (!rows.length) return raw('');
  const planned = rows.map((r) => r.saving / 12), needed = rows.map((r, i) => r.saving / 12 + extraMonthly * Math.pow(1 + 0.08, r.year - rows[0].year));
  const max = Math.max(...needed, ...planned, 1), nice = Math.pow(10, Math.floor(Math.log10(max))) * Math.ceil(max / Math.pow(10, Math.floor(Math.log10(max)))), Y = (v) => padT + ih - (v / nice) * ih, slot = iw / rows.length, bw = Math.min(22, slot * 0.34);
  let g = ''; for (let i = 0; i <= 3; i++) { const v = (nice / 3) * i; g += `<line x1="${padL}" x2="${w - 8}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--fx-line)" stroke-dasharray="3 4"/><text x="${padL - 6}" y="${Y(v) + 3.5}" font-size="10" fill="var(--muted)" text-anchor="end">${inrC(v)}</text>`; }
  const bars = rows.map((r, i) => { const x = padL + i * slot + slot / 2; return `<rect x="${x - bw - 1}" y="${Y(planned[i])}" width="${bw}" height="${padT + ih - Y(planned[i])}" rx="4" fill="var(--fx)"/><rect x="${x + 1}" y="${Y(needed[i])}" width="${bw}" height="${padT + ih - Y(needed[i])}" rx="4" fill="var(--fx-ok)"/><text x="${x}" y="${hh - 7}" font-size="10" fill="var(--muted)" text-anchor="middle">${r.year}</text>`; }).join('');
  return raw(`<svg class="fx-chart" viewBox="0 0 ${w} ${hh}" role="img" aria-label="Monthly savings projection">${g}${bars}</svg>`);
}
