// Screen: FIRE Overview. What you need, where you stand, and the gap, with all three methods at a glance.
import { h, raw, bind, IC, chip, statusChip, tile, note, bar, head, fxNav, srcChip, toast } from './ui.js';
import { html } from '../core.js';
import * as FS from './store.js';
import * as X from './ctx.js';
import * as D from './duet.js';
import { CLASS_INFO, CLASSES } from './defaults.js';
import { inr, inrC, pc, yrs, monthYear } from './format.js';
import { sectionHealth, reasons } from './health.js';
import { ageStrip } from './charts.js';
import { pickRetireAge, toggleBasis, openMethodPicker, openMenu, METHODS } from './actions.js';
import { openWhatIf } from './whatif.js';
import { openPots } from './breakdown.js';
import { compareScenarios } from './engine.js';

let stripMode = 'gap'; const lab = { age: null, extra: 0, spendPct: 0 }, openAcc = new Set(); const ageCache = { hash: null, rows: null, running: false };

export function retirementBuckets(res) {
  const m = res.model, cats = (m.plan.spending.categories || []).filter((c) => c.group !== 'education');
  const tot = cats.reduce((s, c) => s + (Number(c.monthly) || 0), 0);
  if (tot > 0) { const k = m.retMonthly / tot; const rows = cats.map((c) => ({ name: c.name, v: (Number(c.monthly) || 0) * k * 12, color: c.color || '#8B97B3' })).sort((a, b) => b.v - a.v); const top = rows.slice(0, 4), rest = rows.slice(4).reduce((s, r) => s + r.v, 0); if (rest > 0) top.push({ name: 'Other', v: rest, color: '#8B97B3' }); return top; }
  const gs = m.shares; return [['General living', 'general', '#7C5FE6'], ['Healthcare', 'medical', '#1DDB97'], ['Housing', 'housing', '#3B82F6']].map(([n, k, c]) => ({ name: n, v: m.retMonthly * 12 * (gs[k] || 0), color: c })).filter((r) => r.v > 0);
}

/** Round gauge: how much of the goal is funded. */
function ring(frac, color) {
  const r = 54, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, frac || 0));
  return h`<svg class="fx-ring" viewBox="0 0 140 140" role="img" aria-label="${Math.round((frac || 0) * 100)} percent funded"><circle cx="70" cy="70" r="${r}" fill="none" stroke="var(--fx-tile)" stroke-width="14"/><circle cx="70" cy="70" r="${r}" fill="none" stroke="${color}" stroke-width="14" stroke-linecap="round" stroke-dasharray="${(c * f).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 70 70)"/><text x="70" y="68" text-anchor="middle" class="fx-ring-n">${Math.round((frac || 0) * 100)}%</text><text x="70" y="90" text-anchor="middle" class="fx-ring-s">funded</text></svg>`;
}
const acc = (id, title, value, body) => h`<details class="fx-acc" data-acc="${id}" ${openAcc.has(id) ? raw('open') : ''}><summary><span class="grow">${title}</span><b>${value}</b><span class="fx-acc-c">›</span></summary><div class="fx-acc-b">${body}</div></details>`;
const exTile = (href, act, icon, label, value, sub, tone = '') => {
  const inner = h`<span class="fx-ex-i">${icon}</span><span class="fx-ex-l">${label}</span><span class="fx-ex-v ${tone}">${value}</span><span class="fx-ex-s">${sub}</span><span class="fx-ex-go">›</span>`;
  return href ? h`<a class="fx-ex" href="${href}">${inner}</a>` : h`<button class="fx-ex" data-act="${act}">${inner}</button>`;
};

export async function overview(root) {
  const plan = X.getPlan(), res = X.run(), g = res.gap, m = res.meta, today = X.today();
  const C = (v) => X.conv(v, res), method = plan.settings.headlineMethod || 'deterministic';
  const close = g.amount > 0 ? X.close() : null, mc = X.mcFresh() || FS.fs.mc, mcStale = !!FS.fs.mc && !X.mcFresh();
  const ageNow = m.ageNow, a0 = Math.max(45, ageNow + 1); const grid = X.grid({}, a0, 60), earliest = X.earliestAge(grid);
  const health = sectionHealth(plan, today), reas = reasons(res, plan);
  const sc = compareScenarios(plan, { today }); const base = sc.find((s) => s.scenario.id === 'base');
  const success = mc?.success, mcTone = success == null ? '' : success >= 0.8 ? 'ok' : success >= 0.6 ? 'warn' : 'bad';
  const st = method === 'montecarlo' && success != null ? (success >= 0.8 ? 'on-track' : 'behind') : g.status;
  const pots = res.projection.potsToday, potTotal = res.projection.potsTotal || 1;
  const potRows = CLASSES.map((c) => ({ c, v: pots[c] || 0 })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
  const buckets = retirementBuckets(res), annual = res.target.annualToday;
  const duet = D.hasDuet() ? D.duetStats(plan, today, 'm') : null; const useDuet = duet?.hasData;
  const income = useDuet ? duet.totals.income : m.takeHome, saved = useDuet ? (duet.totals.invested || Math.max(0, duet.totals.income - duet.totals.expense)) : m.sipNow, rate = income ? saved / income : 0;
  const goalsActive = res.goals.filter((x) => x.kind !== 'emergency' || x.needed);
  const upcoming = [...plan.events.filter((e) => e.enabled !== false && e.date).map((e) => ({ t: e.name || e.kind, d: e.date, icon: '📌' })), ...res.goals.filter((x) => x.date && x.kind !== 'retirement').map((x) => ({ t: x.name, d: x.date, icon: x.icon })), { t: 'Retirement', d: `${m.retireYear}-01`, icon: '🌴' }]
    .filter((x) => x.d >= today.slice(0, 7)).sort((a, b) => a.d.localeCompare(b.d)).slice(0, 6);
  const full = plan.settings.viewMode === 'full';
  const fundedColor = g.pct >= 1 ? 'var(--fx-ok)' : g.pct >= 0.8 ? 'var(--fx-warn)' : 'var(--fx-bad)';

  // ---- live lab: real figures, nothing saved until you choose
  const sip0 = m.sipNow, spend0 = res.target.monthlyToday, ageMin = Math.max(ageNow + 1, 40), ageMax = 65;
  if (lab.age == null || lab.age < ageMin || lab.age > ageMax) lab.age = Math.min(ageMax, Math.max(ageMin, m.retireAge));
  const sMin = Math.round((spend0 * 0.6) / 500) * 500, sMax = Math.round((spend0 * 1.4) / 500) * 500, iMax = sip0 + 150000;
  const labRes = () => X.run({ retireAge: lab.age, overrides: { extraMonthly: lab.extra || undefined, retireSpendFactor: 1 + lab.spendPct / 100 } });
  const labOut = () => {
    const r = labRes(), q = r.gap, same = !lab.extra && !lab.spendPct && lab.age === m.retireAge, d = q.pct - g.pct;
    const tone = q.pct >= 1 ? 'ok' : q.pct >= 0.8 ? 'warn' : 'bad';
    return h`<div class="fx-grid3"><div class="fx-tile"><div class="l">Funded</div><div class="v ${tone}">${pc(q.pct)}</div><div class="s">${same ? 'as planned' : `${d >= 0 ? '+' : '−'}${Math.abs(Math.round(d * 100))} pts vs plan`}</div></div>
      <div class="fx-tile"><div class="l">${q.amount > 0 ? 'Shortfall' : 'Surplus'}</div><div class="v ${q.amount > 0 ? 'bad' : 'ok'}">${inrC(X.conv(Math.abs(q.amount), r))}</div><div class="s">at age ${lab.age}</div></div>
      <div class="fx-tile"><div class="l">Need</div><div class="v">${inrC(X.conv(q.target, r))}</div><div class="s">target corpus</div></div></div>`;
  };
  const sl = (key, label, val, min, max, step, shown, ends) => h`<div class="fx-lab-r"><div class="fx-row fx-between"><label for="lab_${key}">${label}</label><b data-lv="${key}">${shown}</b></div><input id="lab_${key}" type="range" class="fx-slider" data-lab="${key}" min="${min}" max="${max}" step="${step}" value="${val}"><div class="fx-sl-ends"><span>${ends[0]}</span><span>${ends[1]}</span></div></div>`;
  const labDirty = lab.extra || lab.spendPct || lab.age !== m.retireAge;

  html(root, h`<div class="fx">
    ${head({ kicker: 'FIRE PLANNER', title: plan.name, right: h`<button class="fx-ib" data-act="basis" aria-label="Money basis"><span class="dot"></span>${X.basisLabel()}</button><button class="fx-ib" data-act="menu" aria-label="More">${IC.more}</button>` })}
    ${health.needing.length ? h`<a class="fx-note warn" href="#/fire/inputs"><span>⚠️</span><div><b>${health.needing.length} input${health.needing.length > 1 ? 's' : ''} need attention.</b> ${health.needing.slice(0, 2).map((x) => x.msg || x.label).join(' · ')}</div></a>` : ''}

    <section class="fx-card glow fx-hero2" aria-label="Your answer">
      <div class="fx-hero2-top">${ring(g.pct, fundedColor)}
        <div class="fx-hero2-n"><div class="fx-row" style="gap:8px;flex-wrap:wrap">${statusChip(st)}<button class="fx-link" data-act="method" style="font-size:12px">${METHODS[method][0]}</button></div>
          <div class="fx-sub" style="margin-top:10px">You need</div><div class="fx-mid">${inr(C(g.target))}</div>
          <div class="fx-sub" style="margin-top:8px">On course for</div><div class="fx-mid ${g.amount > 0 ? 'warn' : 'ok'}">${inr(C(g.projected))}</div></div></div>
      <p class="fx-say" style="margin:14px 0 0">${g.amount > 0 ? h`Retiring at <button class="fx-link" data-act="age" style="font-size:inherit;color:var(--text);font-weight:800;text-decoration:underline dotted">${m.retireAge}</button> (${yrs(m.yearsToRet)} from now) you will be <b>${inr(C(g.amount))}</b> short.${close?.extraMonthly ? h` Investing <b>${inr(close.extraMonthly)} more a month</b> closes it.` : ''}` : h`Retiring at <button class="fx-link" data-act="age" style="font-size:inherit;color:var(--text);font-weight:800;text-decoration:underline dotted">${m.retireAge}</button> you are <b class="ok">ahead of plan</b> by ${inr(C(-g.amount))}.${earliest && earliest < m.retireAge ? h` You could stop as early as <b>${earliest}</b>.` : ''}`}</p>
      <div class="fx-row" style="margin-top:12px;gap:10px"><button class="fx-btn small ghost" data-act="calc" style="flex:1">How it's calculated</button><a class="fx-btn small ghost" href="#/fire/learn" style="flex:1;text-align:center">Guide</a></div></section>

    <section class="fx-card" aria-label="Try changes"><div class="fx-ch"><h3>Try it · drag to see the effect</h3>${labDirty ? h`<button class="fx-link" data-act="labreset">Reset</button>` : ''}</div>
      ${sl('age', 'Retire at age', lab.age, ageMin, ageMax, 1, lab.age, [ageMin, ageMax])}
      ${sl('extra', 'Invest each month', sip0 + lab.extra, sip0, iMax, 1000, inr(sip0 + lab.extra), [`now ${inrC(sip0)}`, inrC(iMax)])}
      ${sl('spend', 'Spend a month in retirement', Math.round(spend0 * (1 + lab.spendPct / 100)), sMin, sMax, 500, inr(spend0 * (1 + lab.spendPct / 100)), [inrC(sMin), inrC(sMax)])}
      <div id="labout" style="margin-top:12px">${labOut()}</div>
      <div class="fx-row" style="margin-top:12px;gap:10px"><button class="fx-btn small" data-act="labuse" style="flex:1" ${labDirty ? '' : raw('disabled')}>Open in what-if lab</button></div>
      <div class="fx-help" style="margin-top:6px">Nothing is saved. The what-if lab lets you save it as a scenario or apply it to the plan.</div></section>

    <section aria-label="Explore"><div class="fx-lbl" style="margin:2px 2px 8px">EXPLORE · tap a tile to go deeper</div><div class="fx-exg">
      ${exTile('#/fire/detail/target', '', '📏', 'Straight-line', pc(g.pct), `funded at ${m.retireAge}`, g.pct >= 1 ? 'ok' : 'warn')}
      ${exTile('#/fire/detail/montecarlo', '', '🎲', `Stress test${mcStale ? ' · old' : ''}`, success != null ? pc(success) : '—', success != null ? 'of futures work' : FS.fs.mc === null ? 'running…' : 'run it', mcTone)}
      ${exTile('#/fire/detail/scenarios', '', '🌐', 'What-if worlds', base?.earliestAge ? `Age ${base.earliestAge}` : '60+', 'earliest (base)')}
      ${exTile('#/fire/detail/gap', '', g.amount > 0 ? '⚠️' : '✅', g.amount > 0 ? 'Gap' : 'Surplus', inrC(C(Math.abs(g.amount))), g.amount > 0 ? 'see how to close it' : 'room to spare', g.amount > 0 ? 'bad' : 'ok')}
      ${exTile('', 'pots', '🧺', 'Money today', inrC(potTotal), 'how it adds up')}
      ${exTile('#/fire/goals', '', '🎯', 'Goals', String(goalsActive.length), 'active')}
      ${exTile('#/fire/inputs/spending', '', '🛒', 'Retirement spending', `${inrC(annual)}/yr`, 'edit categories')}
      ${exTile('#/fire/live', '', '📈', 'Save rate now', pc(rate), 'this month')}
    </div></section>

    ${close && g.amount > 0 ? h`<section class="fx-card"><div class="fx-ch"><h3>Ways to close the gap</h3><a class="fx-link" href="#/fire/detail/gap">All options →</a></div><div class="fx-list">
      ${close.extraMonthly ? h`<div class="fx-li"><span class="fx-em">💰</span><span class="grow"><b>Invest ${inr(close.extraMonthly)} more a month</b></span><button class="fx-link" data-act="lever" data-k="save">Try</button></div>` : ''}
      ${close.earnMoreDelta != null ? h`<div class="fx-li"><span class="fx-em">📈</span><span class="grow"><b>Pay growth ${(plan.assumptions.salaryGrowth + close.earnMoreDelta).toFixed(1)}% a year</b><div class="fx-sub">not ${plan.assumptions.salaryGrowth}%</div></span><button class="fx-link" data-act="lever" data-k="earn">Try</button></div>` : ''}
      ${close.lowerSpendPossible ? h`<div class="fx-li"><span class="fx-em">✂️</span><span class="grow"><b>Spend ${inr(close.lowerSpend)} less a month</b><div class="fx-sub">in retirement</div></span><button class="fx-link" data-act="lever" data-k="spend">Try</button></div>` : ''}</div></section>` : ''}

    <section aria-label="More detail"><div class="fx-row fx-between" style="margin:6px 2px 8px"><span class="fx-lbl">MORE DETAIL</span><div class="fx-seg sm" role="tablist" aria-label="Detail level"><button role="tab" class="${full ? '' : 'on'}" data-act="view" data-k="simple">Less</button><button role="tab" class="${full ? 'on' : ''}" data-act="view" data-k="full">More</button></div></div>
    ${full ? h`<div class="fx-accs">
      ${acc('pots', 'Where your money is', inrC(potTotal), h`${potRows.length ? h`<div class="fx-split">${potRows.map(({ c, v }) => h`<i style="flex:${v};background:${CLASS_INFO[c].color}" title="${CLASS_INFO[c].label}"></i>`)}</div><div class="fx-legend" style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:8px 12px">${potRows.map(({ c, v }) => h`<span><i style="background:${CLASS_INFO[c].color}"></i>${CLASS_INFO[c].short} ${Math.round((v / potTotal) * 100)}% · ${inrC(v)}</span>`)}</div>` : h`<div class="fx-sub">Add your holdings to see how your money is spread.</div>`}<div class="fx-row" style="gap:14px;margin-top:10px"><button class="fx-link" data-act="pots">How is this worked out?</button><a class="fx-link" href="#/fire/inputs/assets">Edit holdings →</a></div>`)}
      ${acc('spend', `Spending at ${m.retireAge}`, `${inrC(annual)}/yr`, h`<div class="col" style="gap:12px">${buckets.map((b) => h`<div class="fx-row" style="gap:12px"><span style="width:92px;color:var(--muted);font-size:14px">${b.name}</span><div class="fx-bar grow" style="--fill:${b.color}"><i style="width:${Math.min(100, (b.v / (buckets[0].v || 1)) * 100)}%"></i></div><b style="width:58px;text-align:right">${inrC(b.v)}</b></div>`)}</div>`)}
      ${acc('income', 'Income & savings this month', pc(rate), h`<div class="fx-grid3">${tile('Take-home', h`<span class="ok">${inrC(income)}</span>`)}${tile('Saved', h`<span class="pur">${inrC(saved)}</span>`)}${tile('Save rate', h`<span class="warn">${pc(rate)}</span>`)}</div><div class="fx-sub" style="margin-top:8px">${srcChip(useDuet ? 'duet' : 'entered')}</div>`)}
      ${acc('age', 'Which retirement age?', earliest ? `from ${earliest}` : 'none ≤ 60', h`<div class="fx-seg sm" style="margin-bottom:10px"><button class="${stripMode === 'gap' ? 'on' : ''}" data-act="strip" data-m="gap">Gap</button><button class="${stripMode === 'success' ? 'on' : ''}" data-act="strip" data-m="success">Success %</button></div><div id="agestrip">${ageStrip(stripMode === 'success' && ageCache.rows ? ageCache.rows : grid, { selected: m.retireAge, earliest, mode: stripMode === 'success' && ageCache.rows ? 'success' : 'gap' })}</div><div class="fx-sub" style="margin-top:6px">${stripMode === 'success' && !ageCache.rows ? 'Calculating success by age…' : earliest ? `⚑ Earliest age that works: ${earliest}. Tap a bar to set your retirement age.` : 'No age up to 60 closes the gap yet. Tap a bar to compare ages.'}</div>`)}
      ${acc('why', 'Why this status', `${reas.length} reason${reas.length === 1 ? '' : 's'}`, h`<div class="col" style="gap:12px">${reas.map((r) => h`<a class="fx-row" href="${r.to}" style="align-items:flex-start;gap:12px"><span style="font-size:20px">${r.icon}</span><span style="font-size:14.5px;line-height:1.4">${r.text}</span></a>`)}</div>`)}
      ${acc('soon', 'Coming up', `${upcoming.length} dates`, h`<div class="col" style="gap:10px">${upcoming.map((u) => h`<div class="fx-row" style="gap:12px"><span style="font-size:20px">${u.icon}</span><span class="grow"><b>${u.t}</b></span><span class="fx-sub">${monthYear(u.d)}</span></div>`)}</div>`)}
    </div>` : h`<div class="fx-sub" style="padding:0 2px">Tap <b>More</b> for where your money is, retirement spending, income, retirement-age chart and the reasons behind the status.</div>`}</section>

    <div class="fx-sub center" style="padding:4px 10px"><button class="fx-link" data-act="recalc" style="font-size:13px">Recalculate</button><br>Estimates from your assumptions. Not financial, tax or legal advice.</div>
    ${fxNav('overview')}</div>`);

  const upd = () => {
    const set = (k, t) => { const e = root.querySelector(`[data-lv="${k}"]`); if (e) e.textContent = t; };
    set('age', lab.age); set('extra', inr(sip0 + lab.extra)); set('spend', inr(spend0 * (1 + lab.spendPct / 100)));
    html(root.querySelector('#labout'), labOut());
  };
  root.addEventListener('input', (e) => {
    const k = e.target.dataset?.lab; if (!k) return; const v = Number(e.target.value);
    if (k === 'age') lab.age = v; else if (k === 'extra') lab.extra = Math.max(0, Math.round(v - sip0)); else lab.spendPct = (v / Math.max(1, spend0) - 1) * 100;
    upd();
  });
  root.addEventListener('change', (e) => { if (e.target.dataset?.lab) X.redraw(); });   // let go of a slider: refresh the Reset / Open buttons
  root.addEventListener('toggle', (e) => { const id = e.target.dataset?.acc; if (id) e.target.open ? openAcc.add(id) : openAcc.delete(id); }, true);

  bind(root, { click: {
    view: (el) => FS.edit('settings', (x) => { x.viewMode = el.dataset.k; return x; }, { immediate: true, noUndo: true }),
    pots: () => openPots(),
    basis: () => toggleBasis(), menu: () => openMenu(), method: () => openMethodPicker(), calc: () => { location.hash = '#/fire/detail/calc'; },
    labreset: () => { lab.age = m.retireAge; lab.extra = 0; lab.spendPct = 0; X.redraw(); },
    labuse: () => openWhatIf({ retireAge: lab.age, extraMonthly: lab.extra || undefined, spendPct: Math.round(lab.spendPct) || undefined }),
    recalc: async () => { toast('Recalculating…'); await X.ensureMc({ force: true }); },
    lever: (el) => openWhatIf(el.dataset.k === 'save' ? { extraMonthly: Math.round(close.extraMonthly / 500) * 500 } : el.dataset.k === 'earn' ? { incomeGrowthDeltaPct: Math.ceil(close.earnMoreDelta * 2) / 2 } : { spendCutMonthly: Math.ceil(close.lowerSpend / 500) * 500 }),
    age: (el) => { if (el.dataset.age) { FS.edit('settings', (x) => { x.retireAge = Number(el.dataset.age); return x; }, { immediate: true }); } else pickRetireAge(); },
    strip: async (el) => { stripMode = el.dataset.m; if (stripMode === 'success' && (!ageCache.rows || ageCache.hash !== X.planHash())) { html(root.querySelector('#agestrip'), h`<div class="fx-sub">Calculating…</div>`); ageCache.rows = await X.runMcByAge({}, a0, 60); ageCache.hash = X.planHash(); } X.redraw(); },
  } });
  if (!FS.fs.mc || mcStale) X.ensureMc().catch(() => {});
}
