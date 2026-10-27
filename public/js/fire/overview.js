// Screen: FIRE Overview. What you need, where you stand, and the gap, with all three methods at a glance.
import { h, bind, IC, chip, statusChip, tile, note, bar, head, fxNav, srcChip, toast } from './ui.js';
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
import { compareScenarios } from './engine.js';

let stripMode = 'gap'; const ageCache = { hash: null, rows: null, running: false };

export function retirementBuckets(res) {
  const m = res.model, cats = (m.plan.spending.categories || []).filter((c) => c.group !== 'education');
  const tot = cats.reduce((s, c) => s + (Number(c.monthly) || 0), 0);
  if (tot > 0) { const k = m.retMonthly / tot; const rows = cats.map((c) => ({ name: c.name, v: (Number(c.monthly) || 0) * k * 12, color: c.color || '#8B97B3' })).sort((a, b) => b.v - a.v); const top = rows.slice(0, 4), rest = rows.slice(4).reduce((s, r) => s + r.v, 0); if (rest > 0) top.push({ name: 'Other', v: rest, color: '#8B97B3' }); return top; }
  const gs = m.shares; return [['General living', 'general', '#7C5FE6'], ['Healthcare', 'medical', '#1DDB97'], ['Housing', 'housing', '#3B82F6']].map(([n, k, c]) => ({ name: n, v: m.retMonthly * 12 * (gs[k] || 0), color: c })).filter((r) => r.v > 0);
}

export async function overview(root) {
  const plan = X.getPlan(), res = X.run(), g = res.gap, m = res.meta, today = X.today();
  const C = (v) => X.conv(v, res), method = plan.settings.headlineMethod || 'deterministic';
  const close = g.amount > 0 ? X.close() : null, mc = X.mcFresh() || FS.fs.mc, mcStale = !!FS.fs.mc && !X.mcFresh();
  const ageNow = m.ageNow, a0 = Math.max(45, ageNow + 1); const grid = X.grid({}, a0, 60), earliest = X.earliestAge(grid);
  const health = sectionHealth(plan, today), reas = reasons(res, plan);
  const sc = compareScenarios(plan, { today }); const base = sc.find((s) => s.scenario.id === 'base'), best = sc.filter((s) => s.earliestAge != null).sort((a, b) => a.earliestAge - b.earliestAge)[0];
  const success = mc?.success, mcTone = success == null ? '' : success >= 0.8 ? 'ok' : success >= 0.6 ? 'warn' : 'bad';
  const st = method === 'montecarlo' && success != null ? (success >= 0.8 ? 'on-track' : 'behind') : g.status;
  const pots = res.projection.potsToday, potTotal = res.projection.potsTotal || 1;
  const potRows = CLASSES.map((c) => ({ c, v: pots[c] || 0 })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
  const buckets = retirementBuckets(res), annual = res.target.annualToday;
  const duet = D.hasDuet() ? D.duetStats(plan, today, 'm') : null; const useDuet = duet?.hasData;
  const income = useDuet ? duet.totals.income : m.takeHome, saved = useDuet ? (duet.totals.invested || Math.max(0, duet.totals.income - duet.totals.expense)) : m.sipNow, rate = income ? saved / income : 0;
  const goals = res.goals.filter((x) => x.kind !== 'emergency' || true).slice(0, 4);
  const upcoming = [...plan.events.filter((e) => e.enabled !== false && e.date).map((e) => ({ t: e.name || e.kind, d: e.date, icon: '📌' })), ...res.goals.filter((x) => x.date && x.kind !== 'retirement').map((x) => ({ t: x.name, d: x.date, icon: x.icon })), { t: 'Retirement', d: `${m.retireYear}-01`, icon: '🌴' }]
    .filter((x) => x.d >= today.slice(0, 7)).sort((a, b) => a.d.localeCompare(b.d)).slice(0, 6);
  const fundedColor = g.pct >= 1 ? 'var(--fx-ok)' : g.pct >= 0.8 ? 'var(--fx-warn)' : 'var(--fx-bad)';

  const methodCards = h`<div class="fx-grid3">
    <a class="fx-tile" href="#/fire/detail/target" style="display:block"><div class="l">Deterministic</div><div class="v ${g.pct >= 1 ? 'ok' : 'warn'}">${pc(g.pct)}</div><div class="s">funded at ${m.retireAge}</div></a>
    <a class="fx-tile" href="#/fire/detail/montecarlo" style="display:block"><div class="l">Monte Carlo${mcStale ? ' · old' : ''}</div><div class="v ${mcTone}">${success != null ? pc(success) : '—'}</div><div class="s">${success != null ? 'success' : FS.fs.mc === null ? 'running…' : 'run it'}</div></a>
    <a class="fx-tile" href="#/fire/detail/scenarios" style="display:block"><div class="l">Scenarios</div><div class="v">${base?.earliestAge ? `Age ${base.earliestAge}` : '60+'}</div><div class="s">${best && best.earliestAge !== base?.earliestAge ? `best: ${best.scenario.name} ${best.earliestAge}` : 'earliest (base)'}</div></a></div>`;

  html(root, h`<div class="fx">
    ${head({ kicker: 'FIRE PLANNER', title: plan.name, right: h`<button class="fx-ib" data-act="basis" aria-label="Money basis"><span class="dot"></span>${X.basisLabel()}</button><button class="fx-ib" data-act="menu" aria-label="More">${IC.more}</button>` })}
    <button class="fx-card fx-row fx-between" data-act="method" style="padding:14px 18px;text-align:left;gap:10px"><span class="fx-sub" style="color:var(--text);font-size:15px;white-space:nowrap">Status · <b>${METHODS[method][0]}</b></span><span class="fx-row" style="gap:8px">${statusChip(st)}<span class="fx-chip pur">${METHODS[method][1]}</span></span></button>
    ${health.needing.length ? h`<a class="fx-note warn" href="#/fire/inputs"><span>⚠️</span><div><b>${health.needing.length} input${health.needing.length > 1 ? 's' : ''} need attention.</b> ${health.needing.slice(0, 2).map((s) => s.msg || s.label).join(' · ')}<div class="fx-bar" style="margin-top:8px"><i style="width:${health.pct * 100}%"></i></div></div></a>` : ''}
    <div class="fx-card"><div class="fx-hero"><div><div class="fx-sub">Retire at age <button class="fx-link" data-act="age" style="font-size:inherit;color:var(--text);font-weight:800;text-decoration:underline dotted">${m.retireAge}</button> · ${yrs(m.yearsToRet)}</div><div class="fx-big" style="margin-top:6px">${inr(C(g.target))}</div><div class="fx-sub">target corpus · ${X.basis() === 'nominal' ? `${m.retireYear} rupees` : "today's money"}</div></div>
      <div class="fx-right"><div class="fx-sub">Projected at ${m.retireAge}</div><div class="fx-mid ${g.amount > 0 ? 'warn' : 'ok'}" style="margin:4px 0 8px">${inr(C(g.projected))}</div>${srcChip(plan.holdings.some((x) => x.linkedWalletId != null || x.linkedInvestmentId != null) ? 'duet' : 'entered')}</div></div>
      <div style="margin-top:14px">${bar(Math.min(1, g.pct), fundedColor)}<div class="fx-row fx-between fx-sub" style="margin-top:6px"><span>${pc(g.pct)} funded</span><button class="fx-link" data-act="calc" style="font-size:13px">Show detailed calculation →</button></div></div></div>
    ${g.amount > 0 ? h`<div class="fx-card bad"><div class="fx-row fx-between" style="align-items:flex-start;gap:12px"><div><div class="bad" style="font-weight:700">⚠ Gap · shortfall</div><div class="fx-big bad" style="margin:4px 0 6px">${inr(C(g.amount))}</div><div class="fx-sub" style="color:var(--text)">${close?.extraMonthly ? h`Save <b>${inr(close.extraMonthly)} more / month</b> to close it` : 'See the Gap tab for ways to close it'}</div></div>
        <div class="fx-right"><div class="fx-sub">Or retire at</div><div class="fx-mid warn" style="margin:4px 0">${close?.laterAge ? `Age ${close.laterAge}` : 'Age 60+'}</div><div class="fx-sub">with current pace</div></div></div>
        <div class="fx-row" style="margin-top:14px;gap:10px"><a class="fx-btn small ghost" href="#/fire/detail/gap" style="flex:1">See how to close it</a><button class="fx-btn small" data-act="whatif" style="flex:1">Try what-if</button></div></div>`
      : h`<div class="fx-card good"><div class="ok" style="font-weight:700">✓ Surplus</div><div class="fx-big ok" style="margin:4px 0 6px">${inr(C(-g.amount))}</div><div class="fx-sub" style="color:var(--text)">${earliest && earliest < m.retireAge ? h`You could retire as early as <b>age ${earliest}</b>.` : 'Your plan covers the target at this retirement age.'}</div><button class="fx-btn small ghost" data-act="whatif" style="margin-top:12px">Try what-if</button></div>`}
    <div class="fx-card"><div class="fx-ch" style="margin-bottom:10px"><h3>Three methods</h3><a class="fx-link" href="#/fire/detail/target">Open detail →</a></div>${methodCards}</div>
    <div class="fx-card"><div class="fx-ch"><h3>Pots · ${inr(potTotal)} today</h3><a class="fx-link" href="#/fire/inputs/assets">Edit →</a></div>
      ${potRows.length ? h`<div class="fx-split">${potRows.map(({ c, v }) => h`<i style="flex:${v};background:${CLASS_INFO[c].color}" title="${CLASS_INFO[c].label}"></i>`)}</div><div class="fx-legend" style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:8px 12px">${potRows.map(({ c, v }) => h`<span><i style="background:${CLASS_INFO[c].color}"></i>${CLASS_INFO[c].short} ${Math.round((v / potTotal) * 100)}% · ${inrC(v)}</span>`)}</div>` : h`<div class="fx-sub">Add your holdings to see how your money is spread.</div>`}</div>
    <div class="fx-card"><div class="fx-ch"><h3>Spending at ${m.retireAge} · ${inrC(annual)}/yr</h3>${srcChip(plan.spending.retirement?.monthly != null ? 'entered' : 'est')}</div>
      <div class="col" style="gap:12px">${buckets.map((b) => h`<div class="fx-row" style="gap:12px"><span style="width:92px;color:var(--muted);font-size:15px">${b.name}</span><div class="fx-bar grow" style="--fill:${b.color}"><i style="width:${Math.min(100, (b.v / (buckets[0].v || 1)) * 100)}%"></i></div><b style="width:58px;text-align:right">${inrC(b.v)}</b></div>`)}</div></div>
    <div class="fx-card"><div class="fx-ch"><h3>Income & Savings · this month</h3>${srcChip(useDuet ? 'duet' : 'entered')}</div><div class="fx-grid3">${tile('Take-home', h`<span class="ok">${inrC(income)}</span>`)}${tile('Saved', h`<span class="pur">${inrC(saved)}</span>`)}${tile('Save rate', h`<span class="warn">${pc(rate)}</span>`)}</div></div>
    <div class="fx-card"><div class="fx-ch"><h3>Goals · ${res.goals.filter((x) => x.kind !== 'emergency' || x.needed).length} active</h3><a class="fx-link" href="#/fire/goals">See all →</a></div><div class="fx-list">${goals.map((x) => h`<a class="fx-li" href="#/fire/goal/${x.id}"><span style="font-size:22px">${x.icon}</span><span class="grow ellipsis" style="font-weight:700">${x.name}</span><span class="fx-sub">${inrC(x.needed)}${x.year ? ` · ${x.year}` : ''}</span>${statusChip(x.status)}</a>`)}</div></div>
    <div class="fx-card"><div class="fx-ch"><h3>Which retirement age?</h3><div class="fx-seg sm"><button class="${stripMode === 'gap' ? 'on' : ''}" data-act="strip" data-m="gap">Gap</button><button class="${stripMode === 'success' ? 'on' : ''}" data-act="strip" data-m="success">Success %</button></div></div>
      <div id="agestrip">${ageStrip(stripMode === 'success' && ageCache.rows ? ageCache.rows : grid, { selected: m.retireAge, earliest, mode: stripMode === 'success' && ageCache.rows ? 'success' : 'gap' })}</div>
      <div class="fx-sub" style="margin-top:6px">${stripMode === 'success' && !ageCache.rows ? 'Calculating success by age…' : earliest ? `⚑ Earliest age that works: ${earliest}. Tap a bar to set your retirement age.` : 'No age up to 60 closes the gap yet. Tap a bar to compare ages.'}</div></div>
    <div class="fx-card"><div class="fx-ch"><h3>Why this status</h3></div><div class="col" style="gap:12px">${reas.map((r) => h`<a class="fx-row" href="${r.to}" style="align-items:flex-start;gap:12px"><span style="font-size:20px">${r.icon}</span><span style="font-size:14.5px;line-height:1.4">${r.text}</span></a>`)}</div></div>
    ${close && g.amount > 0 ? h`<div class="fx-card"><div class="fx-ch"><h3>Biggest levers</h3><a class="fx-link" href="#/fire/detail/gap">All options →</a></div><div class="fx-list">
      ${close.extraMonthly ? h`<div class="fx-li"><span style="font-size:22px">💰</span><span class="grow"><b>Save ${inr(close.extraMonthly)} more a month</b><div class="fx-sub">closes the ${inr(C(g.amount))} gap</div></span><button class="fx-link" data-act="lever" data-k="save">Try it</button></div>` : ''}
      ${close.earnMoreDelta != null ? h`<div class="fx-li"><span style="font-size:22px">📈</span><span class="grow"><b>Grow income ${close.earnMoreDelta.toFixed(1)}% faster</b><div class="fx-sub">with savings rising alongside</div></span><button class="fx-link" data-act="lever" data-k="earn">Try it</button></div>` : ''}
      ${close.lowerSpendPossible ? h`<div class="fx-li"><span style="font-size:22px">✂️</span><span class="grow"><b>Spend ${inr(close.lowerSpend)} less a month</b><div class="fx-sub">at retirement</div></span><button class="fx-link" data-act="lever" data-k="spend">Try it</button></div>` : ''}</div></div>` : ''}
    <div class="fx-card"><div class="fx-ch"><h3>Coming up</h3></div><div class="fx-row" style="overflow-x:auto;gap:10px;padding-bottom:4px">${upcoming.map((u) => h`<div class="fx-tile" style="min-width:128px"><div style="font-size:20px">${u.icon}</div><div style="font-weight:700;margin-top:4px;font-size:14px">${u.t}</div><div class="s">${monthYear(u.d)}</div></div>`)}</div></div>
    <div class="fx-sub center" style="padding:4px 10px">Last calculated ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} · <button class="fx-link" data-act="recalc" style="font-size:13px">Recalculate</button><br>Estimates from your assumptions. Not financial, tax or legal advice.</div>
    ${fxNav('overview')}</div>`);

  bind(root, { click: {
    basis: () => toggleBasis(), menu: () => openMenu(), method: () => openMethodPicker(), calc: () => { location.hash = '#/fire/detail/calc'; },
    whatif: () => openWhatIf(), recalc: async () => { toast('Recalculating…'); await X.ensureMc({ force: true }); },
    lever: (el) => openWhatIf(el.dataset.k === 'save' ? { extraMonthly: Math.round(close.extraMonthly / 500) * 500 } : el.dataset.k === 'earn' ? { incomeGrowthDeltaPct: Math.ceil(close.earnMoreDelta * 2) / 2 } : { spendCutMonthly: Math.ceil(close.lowerSpend / 500) * 500 }),
    age: (el, e) => { if (el.dataset.age) { FS.edit('settings', (s) => { s.retireAge = Number(el.dataset.age); return s; }, { immediate: true }); } else pickRetireAge(); },
    strip: async (el) => { stripMode = el.dataset.m; if (stripMode === 'success' && (!ageCache.rows || ageCache.hash !== X.planHash())) { html(root.querySelector('#agestrip'), h`<div class="fx-sub">Calculating…</div>`); ageCache.rows = await X.runMcByAge({}, a0, 60); ageCache.hash = X.planHash(); } X.redraw(); },
  } });
  if (!FS.fs.mc || mcStale) X.ensureMc().catch(() => {});
}
