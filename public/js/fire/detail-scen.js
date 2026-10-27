// Detail tab: Scenarios and sensitivity (method 3).
import { h, raw, IC, chip, tile, note, openForm, openInfo, toast, undoToast, sheet, confirmSheet } from './ui.js';
import * as FS from './store.js';
import * as X from './ctx.js';
import { inr, inrC, pc, pp } from './format.js';
import { compareScenarios, allScenarios, sensitivity, eventImpacts, runPlan, scenarioOf } from './engine.js';
import { BUILTIN_SCENARIOS, uid } from './defaults.js';
import { heat, tornado, multiLine } from './charts.js';

const ui = { who: 'household', compare: false, picked: [], lever: ['age', 'save'], mcFor: {} };

/** Household, only you, or only your partner (own holdings and income; spending and loans stay household-wide). */
export function scopePlan(plan, who) {
  if (who === 'household' || plan.profile.people.length < 2) return plan;
  const idx = who === 'partner' ? 1 : 0, p = plan.profile.people[idx], rest = plan.profile.people.filter((_, i) => i !== idx), id = p.id, first = plan.profile.people[0].id;
  const owner = (x, key) => (x[key] || first) === id;
  return { ...plan, profile: { ...plan.profile, people: [p, ...rest] }, holdings: plan.holdings.filter((x) => owner(x, 'owner')), incomes: plan.incomes.filter((x) => owner(x, 'person')) };
}

const LEVERS = { age: ['Retirement age', (v) => ({ retireAgeDelta: v }), [-2, 0, 2, 4, 6], (v) => `${v > 0 ? '+' : ''}${v} yrs`], save: ['Extra monthly saving', (v) => ({ extraMonthly: v }), [0, 10000, 20000, 40000, 60000], (v) => `+${inrC(v)}`],
  spend: ['Retirement spending', (v) => ({ retireSpendFactor: 1 + v / 100 }), [-20, -10, 0, 10, 20], (v) => `${v > 0 ? '+' : ''}${v}%`], equity: ['Equity return', (v) => ({ equityReturnDeltaPct: v }), [-4, -2, 0, 2, 4], (v) => `${v > 0 ? '+' : ''}${v} pts`], infl: ['Inflation', (v) => ({ inflationDeltaPct: v }), [-1, 0, 1, 2, 3], (v) => `${v > 0 ? '+' : ''}${v} pts`] };

export function scenariosTab(planRaw, resRaw) {
  const plan = scopePlan(planRaw, ui.who), res = ui.who === 'household' ? resRaw : X.run({}, plan), C = (v) => X.conv(v, res), today = X.today();
  const cmp = compareScenarios(plan, { today }), hash = X.planHash() + ui.who, active = planRaw.settings.activeScenarioId, m = res.meta;
  const ages = [45, 48, 51, 54, 57, 60].filter((a) => a > m.ageNow), colLabels = ages.map(String);
  const mcFor = (sc) => { const key = `${hash}|${sc.scenario.id}`; if (ui.mcFor[key] !== undefined) return ui.mcFor[key]; ui.mcFor[key] = null; X.runMc({ scenarioId: sc.scenario.id, retireAge: sc.earliestAge ?? sc.atAge }, { paths: 2500 }).then((r) => { ui.mcFor[key] = r.success; X.redraw(); }).catch(() => {}); return null; };
  const col = (id) => (id === 'optimistic' ? 'var(--fx-ok)' : id === 'pessimistic' ? 'var(--fx-bad)' : id === 'base' ? 'var(--fx2)' : 'var(--text)');
  const card = (c) => {
    const sc = c.scenario, isActive = sc.id === active, mc = mcFor(c), ov = sc.overrides || {}, tone = mc == null ? '' : mc >= 0.8 ? 'ok' : mc >= 0.6 ? 'warn' : 'bad', fill = tone === 'ok' ? 'var(--fx-ok)' : tone === 'warn' ? 'var(--fx-warn)' : 'var(--fx-bad)';
    const chipTxt = isActive && c.earliestAge ? `Age ${c.earliestAge} (det.) / ${mc != null ? Math.round(mc * 100) + '% MC' : '…'}` : c.earliestAge ? `Retire age ${c.earliestAge}` : 'Beyond 60';
    return h`<div class="fx-card ${isActive ? '' : ''}" style="${isActive ? 'border:2px solid var(--fx);' : ''}position:relative;overflow:visible">${isActive ? h`<span class="fx-chip pur" style="position:absolute;top:-12px;right:18px;background:var(--fx);color:#fff;font-weight:800;font-size:11px;letter-spacing:.06em">CURRENT PLAN</span>` : ''}
      <div class="fx-row" style="gap:12px;align-items:flex-start">${ui.compare ? h`<button class="fx-opt ${ui.picked.includes(sc.id) ? 'on' : ''}" data-act="pickc" data-id="${sc.id}" style="padding:6px 11px" aria-label="Compare ${sc.name}">${ui.picked.includes(sc.id) ? '✓' : '○'}</button>` : ''}
        <button class="fx-row grow" data-act="edit" data-id="${sc.id}" style="gap:12px;text-align:left;align-items:flex-start"><span class="fx-ico" style="width:54px;height:54px;font-size:26px">${sc.icon}</span><span class="grow"><b style="font-size:20px;color:${col(sc.id)}">${sc.name}</b><div class="fx-sub">${sc.desc || ''}</div></span></button>
        <span class="fx-chip ${c.earliestAge ? (isActive ? 'warn' : 'ok') : 'bad'}" style="white-space:normal;text-align:center">${chipTxt}</span></div>
      <div class="fx-grid3" style="margin-top:14px">${tile('Income growth', `${c.incomeGrowth.toFixed(0)}% / yr`)}${tile('Retirement spend', `${inrC(c.retireMonthly)}/mo`)}${ov.equityReturnDeltaPct ? tile('Equity return', `${c.equityReturn.toFixed(0)}% / yr`) : tile(`Corpus at ${c.atAge}`, inrC(C(c.corpus)))}</div>
      <div class="fx-row" style="margin-top:12px;gap:12px"><div class="fx-bar grow" style="--fill:${fill}"><i style="width:${(mc ?? 0) * 100}%"></i></div><b style="color:${fill};min-width:92px;text-align:right">${mc != null ? `${Math.round(mc * 100)}% success` : 'calculating…'}</b></div>
      ${isActive ? '' : h`<button class="fx-link" data-act="use" data-id="${sc.id}" style="margin-top:10px">Make this the current plan</button>`}</div>`;
  };
  const sel = ui.picked.map((id) => cmp.find((c) => c.scenario.id === id)).filter(Boolean);
  const grid = cmp.map((c) => ages.map((a) => { const g = c.grid.find((x) => x.age === a); return { label: g ? (g.gap <= 0 ? `✓ ${inrC(-g.gap)}` : `−${inrC(g.gap)}`) : '—', tone: g ? (g.pct >= 1 ? 'ok' : g.pct >= 0.85 ? 'warn' : 'bad') : null, mark: c.earliestAge === a, attr: `data-act="cell" data-s="${c.scenario.id}" data-a="${a}"` }; }));
  const sens = sensitivity(plan, { today }), imp = eventImpacts(plan, { today }), [la, lb] = ui.lever;
  const two = LEVERS[la][2].map((va) => LEVERS[lb][2].map((vb) => { const ov = { ...LEVERS[la][1](va), ...LEVERS[lb][1](vb) }; const ra = (ov.retireAgeDelta || 0); delete ov.retireAgeDelta; const r = X.run({ retireAge: m.retireAge + ra, overrides: { ...ov, ...(ov.extraMonthly ? {} : {}) } }, plan); return { label: r.gap.amount <= 0 ? '✓' : `−${inrC(r.gap.amount)}`, tone: r.gap.pct >= 1 ? 'ok' : r.gap.pct >= 0.85 ? 'warn' : 'bad' }; }));
  const body = h`
    <div class="fx-seg">${[['household', 'Household'], ['you', plan.profile.people[0]?.name || 'You'], ['partner', planRaw.profile.people[1]?.name || 'Partner']].filter(([k]) => k !== 'partner' || planRaw.profile.people.length > 1).map(([k, l]) => h`<button class="${ui.who === k ? 'on' : ''}" data-act="who" data-k="${k}">${l}</button>`)}</div>
    ${ui.who !== 'household' ? h`<div class="fx-note"><span>ℹ️</span><div>Showing only this person's holdings and income. Spending, loans and goals stay household-wide.</div></div>` : ''}
    <div class="fx-note" style="border-style:solid"><span>🔀</span><div>Each scenario is a parallel universe: same starting pots, different life choices. Tap any to edit, or <button class="fx-link" data-act="cmp">${ui.compare ? 'stop comparing' : 'compare two'}</button>.</div></div>
    ${cmp.map(card)}
    <button class="fx-add" data-act="new" style="border-radius:24px">${IC.plus}<span>Add custom scenario</span></button>
    ${ui.compare && sel.length === 2 ? h`<div class="fx-card"><h3>${sel[0].scenario.name} vs ${sel[1].scenario.name}</h3><div class="fx-scroll" style="margin-top:8px"><table class="fx-table"><thead><tr><th></th><th>${sel[0].scenario.name}</th><th>${sel[1].scenario.name}</th></tr></thead><tbody>
      ${[['Earliest age', (c) => c.earliestAge ?? '60+'], ['Income growth', (c) => `${c.incomeGrowth.toFixed(0)}%`], ['Retirement spend', (c) => `${inrC(c.retireMonthly)}/mo`], ['Corpus', (c) => inrC(C(c.corpus))], ['Target', (c) => inrC(C(c.target))], ['Gap', (c) => (c.gap > 0 ? `−${inrC(C(c.gap))}` : `+${inrC(C(-c.gap))}`)]].map(([l, f]) => h`<tr><td>${l}</td><td>${f(sel[0])}</td><td>${f(sel[1])}</td></tr>`)}</tbody></table></div>
      <div style="margin-top:12px">${multiLine(sel.map((c, i) => ({ ys: X.run({ scenarioId: c.scenario.id, retireAge: c.atAge }, plan).projection.rows.filter((r) => r.corpus != null).map((r) => C(r.corpus)), color: i ? 'var(--fx-warn)' : 'var(--fx)' })), X.run({}, plan).projection.rows.filter((r) => r.corpus != null).map((r) => String(r.year).slice(2)), { target: C(res.gap.target) })}<div class="fx-legend" style="margin-top:6px">${sel.map((c, i) => h`<span><i style="background:${i ? 'var(--fx-warn)' : 'var(--fx)'}"></i>${c.scenario.name}</span>`)}</div></div></div>` : ''}
    <div class="fx-card"><h3>Which age works, in each scenario?</h3><div class="fx-sub" style="margin:4px 0 10px">Gap (or surplus) by retirement age. Outlined = earliest age that works. Tap a cell to use it.</div>${heat(cmp.map((c) => c.scenario.name), colLabels, grid)}
</div></div>
    <div class="fx-card"><h3>What moves the result</h3><div class="fx-sub" style="margin:4px 0 8px">Gap change when each lever moves. Green is a smaller gap.</div>${tornado(sens, res.gap.amount)}</div>
    <div class="fx-card"><h3>Two levers together</h3><div class="fx-row" style="gap:10px;margin:10px 0">${[0, 1].map((i) => h`<select class="fx-in" data-act="lever" data-i="${i}" style="padding:10px 12px;font-size:14px">${Object.entries(LEVERS).map(([k, v]) => h`<option value="${k}" ${ui.lever[i] === k ? raw('selected') : ''}>${v[0]}</option>`)}</select>`)}</div>
      <div class="fx-scroll"><table class="fx-table"><thead><tr><th>${LEVERS[la][0]} ↓ / ${LEVERS[lb][0]} →</th>${LEVERS[lb][2].map((v) => h`<th>${LEVERS[lb][3](v)}</th>`)}</tr></thead><tbody>${LEVERS[la][2].map((va, i) => h`<tr><td>${LEVERS[la][3](va)}</td>${two[i].map((c) => h`<td class="${c.tone === 'ok' ? 'ok' : c.tone === 'warn' ? 'warn' : 'bad'}" style="font-weight:700">${c.label}</td>`)}</tr>`)}</tbody></table></div></div>
    ${imp.length ? h`<div class="fx-card"><h3>Life events, one by one</h3><div class="fx-sub" style="margin:4px 0 8px">Change in your retirement corpus because of each event.</div><div class="fx-list">${imp.map((x) => { const e = plan.events.find((y) => y.id === x.id); return h`<a class="fx-li" href="#/fire/inputs/events"><span style="font-size:20px">${e.icon || '📌'}</span><span class="grow"><b>${e.name || e.kind}</b></span><b class="${x.impact < -1 ? 'bad' : x.impact > 1 ? 'ok' : 'mut'}">${Math.abs(x.impact) < 1 ? 'no effect' : `${x.impact < 0 ? '−' : '+'}${inrC(C(Math.abs(x.impact)))}`}</b></a>`; })}</div></div>` : ''}`;
  return { body, after: { clicks: {
    who: (el) => { ui.who = el.dataset.k; ui.picked = []; X.redraw(); }, cmp: () => { ui.compare = !ui.compare; ui.picked = []; X.redraw(); },
    pickc: (el) => { const id = el.dataset.id; ui.picked = ui.picked.includes(id) ? ui.picked.filter((x) => x !== id) : [...ui.picked, id].slice(-2); X.redraw(); },
    edit: (el) => { if (ui.compare) return el.closest('.fx-card').querySelector('[data-act=pickc]').click(); editScenario(el.dataset.id); }, new: () => editScenario(), newscen: () => editScenario(),
    use: (el) => { FS.edit('settings', (s) => { s.activeScenarioId = el.dataset.id; return s; }, { immediate: true }); toast('Scenario is now the current plan'); },
    cell: (el) => { FS.edit('settings', (s) => { s.activeScenarioId = el.dataset.s; s.retireAge = Number(el.dataset.a); return s; }, { immediate: true }); },
  }, changes: { lever: (el) => { ui.lever[Number(el.dataset.i)] = el.value; X.redraw(); } } } };
}

/** Add or edit a scenario. A built-in one is saved as an override and can be reset to its default. */
export function editScenario(id) {
  const plan = X.getPlan(), sc = id ? allScenarios(plan).find((s) => s.id === id) : null, ov = sc?.overrides || {}, builtin = id && BUILTIN_SCENARIOS.some((b) => b.id === id), isBase = id === 'base';
  openForm({ title: sc ? `Edit ${sc.name}` : 'New scenario', sub: 'Changes are measured against your base plan.',
    values: { name: sc?.name || '', icon: sc?.icon || '🎯', desc: sc?.desc || '', incomeGrowthDeltaPct: ov.incomeGrowthDeltaPct ?? 0, retireSpendPct: Math.round(((ov.retireSpendFactor ?? 1) - 1) * 100), equityReturnDeltaPct: ov.equityReturnDeltaPct ?? 0, inflationDeltaPct: ov.inflationDeltaPct ?? 0, sipPct: Math.round(((ov.sipFactor ?? 1) - 1) * 100), retireAge: ov.retireAge ?? null, eventsOff: !!ov.eventsOff, partner: !!ov.partnerWorks, pStart: ov.partnerWorks?.startYear ?? new Date().getFullYear() + 3, pMonthly: ov.partnerWorks?.monthly ?? 50000, pGrowth: ov.partnerWorks?.growthPct ?? 6 },
    fields: [{ name: 'name', label: 'Name', type: 'text', required: true, maxlength: 30 }, { type: 'row', fields: [{ name: 'icon', label: 'Icon', type: 'text', maxlength: 4 }, { name: 'incomeGrowthDeltaPct', label: 'Income growth vs base', type: 'num', suffix: 'pts', min: -10, max: 10 }] },
      { name: 'desc', label: 'Description', type: 'text', maxlength: 60 },
      { type: 'row', fields: [{ name: 'retireSpendPct', label: 'Retirement spend vs base', type: 'pct', min: -60, max: 100 }, { name: 'sipPct', label: 'Monthly saving vs base', type: 'pct', min: -100, max: 200 }] },
      { type: 'row', fields: [{ name: 'equityReturnDeltaPct', label: 'Equity return vs base', type: 'num', suffix: 'pts', min: -10, max: 6 }, { name: 'inflationDeltaPct', label: 'Inflation vs base', type: 'num', suffix: 'pts', min: -3, max: 5 }] },
      { name: 'retireAge', label: 'Fixed retirement age (optional)', type: 'num', min: 35, max: 70, help: 'Leave empty to find the earliest age that works' },
      { name: 'eventsOff', type: 'toggle', hint: 'Ignore all life events' }, { name: 'partner', type: 'toggle', hint: 'Partner earns in this scenario' },
      { type: 'row', fields: [{ name: 'pStart', label: 'From year', type: 'num', show: (v) => v.partner }, { name: 'pMonthly', label: 'Monthly take-home', type: 'money', show: (v) => v.partner }] }, { name: 'pGrowth', label: 'Partner income growth', type: 'pct', show: (v) => v.partner }],
    cta: 'Save scenario',
    onDelete: sc && !isBase ? () => { FS.edit('scenarios', (l) => l.filter((x) => x.id !== id), { immediate: true }); undoToast(builtin ? 'Reset to default' : 'Scenario deleted', () => FS.undo()); } : null, deleteLabel: builtin ? 'Reset to default' : 'Delete scenario',
    onSave: (v) => {
      const overrides = {}; if (v.incomeGrowthDeltaPct) overrides.incomeGrowthDeltaPct = v.incomeGrowthDeltaPct; if (v.retireSpendPct) overrides.retireSpendFactor = 1 + v.retireSpendPct / 100; if (v.equityReturnDeltaPct) overrides.equityReturnDeltaPct = v.equityReturnDeltaPct;
      if (v.inflationDeltaPct) overrides.inflationDeltaPct = v.inflationDeltaPct; if (v.sipPct) overrides.sipFactor = 1 + v.sipPct / 100; if (v.retireAge) overrides.retireAge = v.retireAge; if (v.eventsOff) overrides.eventsOff = true;
      if (v.partner) overrides.partnerWorks = { startYear: Number(v.pStart), monthly: v.pMonthly, growthPct: v.pGrowth };
      const row = { id: sc?.id || uid('sc_'), name: v.name, icon: v.icon || '🎯', desc: v.desc, overrides, ...(builtin ? { builtin: true } : {}) };
      FS.edit('scenarios', (l) => (l.some((x) => x.id === row.id) ? l.map((x) => (x.id === row.id ? row : x)) : [...l, row]), { immediate: true });
    } });
}
export { raw, chip, note, openInfo, sheet, confirmSheet, runPlan, scenarioOf, pc, pp, inr };
