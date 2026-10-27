// Screens: Goals list, Goal detail, and the add / edit / remove / allocate / funding dialogs.
import { h, raw, bind, IC, chip, statusChip, tile, note, bar, head, fxNav, srcChip, openForm, openInfo, toast, undoToast, sheet, confirmSheet, errToast } from './ui.js';
import { html } from '../core.js';
import * as FS from './store.js';
import * as X from './ctx.js';
import { GOAL_KINDS, CLASS_INFO, GROUPS, GROUP_LABEL, uid } from './defaults.js';
import { inr, inrC, pc, yrs, monthYear } from './format.js';
import { lineChart } from './charts.js';
import { runPlan, holdingValue } from './engine.js';

let filter = 'all';
const SWATCH = ['#7C5FE6', '#3B82F6', '#1DDB97', '#F5A623', '#F04444', '#E879A0', '#38BDF8'];
const fillOf = (x) => (x.status === 'ahead' ? 'var(--fx-ok)' : x.pct >= 1 ? 'var(--fx-ok)' : x.pct >= 0.8 ? 'linear-gradient(90deg,var(--fx),var(--fx-warn))' : 'linear-gradient(90deg,var(--fx),var(--fx-bad))');
const subtitle = (x, plan, res) => x.kind === 'retirement' ? `Age ${res.meta.retireAge} · ${res.meta.retireYear}` : x.kind === 'emergency' ? `Always — liquid · ${plan.assumptions.bufferMonths} months expenses` : x.year ? `${x.year} · ${yrs(x.yearsAway)}` : 'Add a date';

export async function goals(root) {
  const plan = X.getPlan(), res = X.run(), C = (v) => X.conv(v, res);
  const archived = plan.goals.filter((g) => g.archived), list = res.goals;
  const shown = filter === 'archived' ? [] : list.filter((x) => filter === 'all' || (filter === 'ontrack' ? x.status !== 'behind' : x.status === 'behind'));
  const on = list.filter((x) => x.status !== 'behind').length, behind = list.length - on;
  const need = list.reduce((s, x) => s + (x.needed || 0), 0);
  const allocated = plan.goals.filter((g) => !g.archived).reduce((s, g) => s + (Number(g.monthlyAlloc) || 0), 0), available = Math.max(0, res.meta.freeCash) + allocated;
  const colorOf = (id) => plan.goals.find((g) => g.id === id)?.color || '#7C5FE6';
  const card = (x) => {
    const g = plan.goals.find((y) => y.id === x.id), cur = x.kind === 'emergency';
    return h`<div class="fx-card" style="padding:16px"><div class="fx-row" style="align-items:flex-start;gap:12px"><a class="fx-row grow" href="#/fire/goal/${x.id}" style="gap:14px;align-items:flex-start"><span class="fx-ico lg" style="background:${colorOf(x.id)}">${x.icon}</span><span class="grow"><b style="font-size:19px">${x.name}</b><div class="fx-sub" style="margin-top:2px">${subtitle(x, plan, res)}</div></span></a><div class="fx-col" style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">${statusChip(x.status)}<button class="fx-link" data-act="gmenu" data-id="${x.id}" aria-label="More for ${x.name}" style="padding:4px">${IC.more}</button></div></div>
      <a href="#/fire/goal/${x.id}" style="display:block"><div class="fx-row fx-between" style="margin-top:14px"><span class="fx-sub" style="font-size:15px">Target</span><b style="font-size:17px">${inr(C(x.needed))}</b></div><div class="fx-row fx-between" style="margin:8px 0 10px"><span class="fx-sub" style="font-size:15px">${cur ? 'Current' : 'Projected'}</span><b style="font-size:17px;color:${x.pct >= 1 ? 'var(--fx-ok)' : 'var(--fx-warn)'}">${inr(C(x.funded))}</b></div>
      ${bar(Math.min(1, x.pct), fillOf(x))}<div class="fx-row fx-between fx-sub" style="margin-top:6px"><span class="${x.pct >= 1 ? 'ok' : 'warn'}">${pc(x.pct)} funded</span><span class="${x.gap > 0 ? 'bad' : 'ok'}">${x.gap > 0 ? `${inrC(C(x.gap))} gap` : `+${inrC(C(-x.gap))} surplus`}</span></div></a></div>`;
  };
  html(root, h`<div class="fx">${head({ kicker: 'FIRE PLANNER', title: 'Goals', right: h`<button class="fx-btn small" data-act="add">+ Add goal</button>` })}
    <div class="fx-grid3">${tile('Total needed', inrC(C(need)))}${tile('On track', h`<span class="ok">${on} / ${list.length}</span>`)}${tile('Behind', h`<span class="warn">${behind} / ${list.length}</span>`)}</div>
    <div class="fx-chips">${[['all', 'All'], ['behind', 'Behind'], ['ontrack', 'On track'], ['archived', `Archived${archived.length ? ` (${archived.length})` : ''}`]].map(([k, l]) => h`<button class="fx-opt ${filter === k ? 'on' : ''}" data-act="filter" data-k="${k}">${l}</button>`)}</div>
    ${filter !== 'archived' ? h`<button class="fx-card" data-act="alloc" style="text-align:left;padding:14px 16px"><div class="fx-row fx-between"><span class="fx-sub">Monthly saving you can allocate</span><b>${inrC(available)}</b></div><div class="fx-split" style="margin:10px 0 6px;height:12px">${plan.goals.filter((g) => !g.archived && g.monthlyAlloc).map((g) => h`<i style="flex:${g.monthlyAlloc};background:${g.color || '#7C5FE6'}"></i>`)}<i style="flex:${Math.max(0.0001, available - allocated)};background:var(--fx-tile)"></i></div><div class="fx-row fx-between fx-sub"><span>${inrC(allocated)} allocated</span><span>${inrC(Math.max(0, available - allocated))} unallocated · tap to allocate</span></div></button>` : ''}
    ${filter === 'archived' ? (archived.length ? archived.map((g) => h`<div class="fx-card fx-row fx-between"><span><b>${g.icon} ${g.name}</b><div class="fx-sub">Archived</div></span><button class="fx-btn small ghost" data-act="restore" data-id="${g.id}">Restore</button></div>`) : h`<div class="fx-note"><span>📦</span><div>No archived goals.</div></div>`) : shown.length ? shown.map(card) : list.length ? h`<div class="fx-note"><span>🎉</span><div>No goals in this filter.</div></div>` : h`<div class="fx-card dashed" style="padding:30px"><div style="font-size:34px">🎯</div><b>No goals yet</b><div class="fx-sub">Start with retirement.</div><button class="fx-btn small" data-act="add" style="margin:14px auto 0">Add retirement goal</button></div>`}
    <button class="fx-fab" data-act="add" aria-label="Add goal">${IC.plus}</button>${fxNav('goals')}</div>`);
  bind(root, { click: {
    add: () => editGoal(), filter: (el) => { filter = el.dataset.k; X.redraw(); }, alloc: () => allocateSheet(res),
    gmenu: (el) => goalMenu(el.dataset.id), restore: (el) => FS.edit('goals', (gs) => gs.map((g) => (g.id === el.dataset.id ? { ...g, archived: false } : g)), { immediate: true }),
  } });
}

function goalMenu(id) {
  const plan = X.getPlan(), g = plan.goals.find((x) => x.id === id), isRet = g.kind === 'retirement', order = plan.goals.filter((x) => !x.archived);
  const s = sheet(h`<div class="fx-sheet-h"><h1>${g.icon} ${g.name}</h1><button class="iconbtn" data-act="close" aria-label="Close">${IC.close}</button></div><div class="fx-list">
    <button class="fx-li" data-act="e"><span class="fx-ico">✏️</span><b class="grow">Edit</b></button><button class="fx-li" data-act="up"><span class="fx-ico">⬆️</span><b class="grow">Higher priority</b></button><button class="fx-li" data-act="down"><span class="fx-ico">⬇️</span><b class="grow">Lower priority</b></button>
    <button class="fx-li" data-act="arch"><span class="fx-ico">📦</span><b class="grow">Archive</b></button>${isRet ? '' : h`<button class="fx-li" data-act="del"><span class="fx-ico">🗑️</span><b class="grow bad">Remove</b></button>`}</div>`, { click: {
    e: () => { s.close(); editGoal(id); }, up: () => { s.close(); move(id, -1); }, down: () => { s.close(); move(id, 1); },
    arch: () => { s.close(); FS.edit('goals', (gs) => gs.map((x) => (x.id === id ? { ...x, archived: true } : x)), { immediate: true }); undoToast(`${g.name} archived`, () => FS.undo()); },
    del: () => { s.close(); removeGoal(id); } } });
}
function move(id, d) {
  FS.edit('goals', (gs) => { const act = gs.filter((x) => !x.archived).sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99)); const i = act.findIndex((x) => x.id === id), j = i + d; if (j < 0 || j >= act.length) return gs; [act[i], act[j]] = [act[j], act[i]]; act.forEach((x, k) => { x.priority = k + 1; }); return gs.map((x) => act.find((y) => y.id === x.id) || x); }, { immediate: true });
}
async function removeGoal(id) {
  const g = X.getPlan().goals.find((x) => x.id === id); if (g.kind === 'retirement') return toast('Retirement can be edited or archived, not removed', true);
  if (await confirmSheet(`Remove ${g.name}?`, 'Its funding plan stays, unlinked. You can also archive it instead.', 'Remove')) {
    FS.edit('goals', (gs) => gs.filter((x) => x.id !== id), { immediate: true }); FS.edit('holdings', (hs) => hs.map((x) => { if (x.goalSplit && id in x.goalSplit) { const gs = { ...x.goalSplit }; delete gs[id]; return { ...x, goalSplit: gs }; } return x; }));
    undoToast(`${g.name} removed`, () => { FS.undo(); FS.undo(); }); location.hash = '#/fire/goals';
  }
}

// ------------------------------------------------------------------------------------------ Goal detail
export async function goalDetail(root, { parts }) {
  const id = parts[0], plan = X.getPlan(), res = X.run(), C = (v) => X.conv(v, res), g = plan.goals.find((x) => x.id === id), x = res.goals.find((y) => y.id === id) || (g && { ...g, needed: 0, funded: 0, gap: 0, pct: 0, status: 'behind' });
  if (!g || !x) { location.hash = '#/fire/goals'; return; }
  const m = res.meta, isRet = g.kind === 'retirement', close = isRet && res.gap.amount > 0 ? X.close() : null;
  const hs = res.model.holdings.filter((q) => !q.virtual && (q.split[g.id] || 0) > 0), part = hs.map((q) => ({ name: q.name, v: q.v0 * q.split[g.id], pct: q.split[g.id], cls: q.cls })).filter((q) => q.v > 0);
  const total = part.reduce((s, q) => s + q.v, 0), events = plan.events.filter((e) => e.goalId === id);
  const idx = res.projection.goalVal[id], series = idx ? Array.from(idx).map((v, i) => ({ y: m.baseYear + i, v })).filter((p) => !x.year || p.y <= x.year) : [];
  const tl = series.length > 2 ? lineChart(series.map((p) => C(p.v)), series.map((p) => String(p.y).slice(2)), { color: 'var(--fx2)', target: C(x.needed) }) : null;
  const reqM = x.requiredMonthly, allocM = Number(g.monthlyAlloc) || 0;
  const body = h`<div class="fx">${head({ kicker: 'GOAL DETAIL', title: g.name, back: '#/fire/goals', right: h`<button class="fx-ib" data-act="edit" style="border-color:var(--text)">Edit</button>` })}
    <div class="fx-card"><div class="fx-row" style="gap:14px;align-items:flex-start"><span class="fx-ico lg" style="background:${g.color || '#7C5FE6'}">${g.icon}</span><div class="grow"><b style="font-size:19px">${g.name}</b><div class="fx-sub">Goal type: ${GOAL_KINDS[g.kind]?.label} · ${subtitle(x, plan, res)}</div></div>${statusChip(x.status)}</div><div style="margin-top:14px">${bar(Math.min(1, x.pct), fillOf(x))}<div class="fx-row fx-between fx-sub" style="margin-top:6px"><span class="${x.pct >= 1 ? 'ok' : 'warn'}">${pc(x.pct)} funded</span><span class="${x.gap > 0 ? 'bad' : 'ok'}">${x.gap > 0 ? `${inrC(C(x.gap))} gap` : `+${inrC(C(-x.gap))} surplus`}</span></div></div></div>
    <div class="fx-card"><div class="fx-lbl">Target amount</div><div class="fx-row fx-between" style="margin-top:8px"><div><div class="fx-big" style="font-size:clamp(26px,8vw,34px)">${inr(C(x.needed))}</div><div class="fx-sub">${X.basis() === 'nominal' ? 'Nominal rupees' : "Today's rupees"} · Inflation-adjusted</div></div>${srcChip(isRet || (g.kind === 'emergency' && !g.target) ? 'est' : 'entered')}</div>
      <div class="fx-row fx-between" style="border-top:1px solid var(--fx-line);margin-top:14px;padding-top:12px"><span class="fx-sub" style="font-size:15px">In nominal terms${x.year ? ` (at ${x.year})` : ''}</span><b class="pur" style="font-size:19px">${inr(x.neededNominal || x.needed)}</b></div></div>
    <div class="fx-card"><div class="fx-lbl">Timeline & status</div><div class="fx-grid2" style="margin-top:10px">${tile('Target date', x.date ? monthYear(x.date) : isRet ? `Jan ${m.retireYear}` : 'Not set', x.yearsAway != null ? yrs(x.yearsAway) : '')}${tile('Goal type', GOAL_KINDS[g.kind]?.label, isRet ? 'Primary goal' : `Priority ${g.priority ?? '-'}`)}${tile(`Projected${x.year ? ` at ${x.year}` : ''}`, h`<span class="${x.pct >= 1 ? 'ok' : 'warn'}">${inr(C(x.funded))}</span>`, `${Math.round(x.pct * 100)}% of target`)}${tile('Gap to close', h`<span class="${x.gap > 0 ? 'bad' : 'ok'}">${x.gap > 0 ? inrC(C(x.gap)) : '✓'}</span>`, isRet && close?.extraMonthly ? `Extra ${inrC(close.extraMonthly)}/mo` : reqM ? `Save ${inrC(reqM)}/mo` : 'No gap')}</div></div>
    ${tl ? h`<div class="fx-card"><h3 style="margin-bottom:8px">Funding over time</h3>${tl}<div class="fx-sub" style="margin-top:6px">Projected money for this goal (line) against the amount needed (dashed).</div></div>` : ''}
    <div class="fx-card"><div class="fx-ch"><div class="fx-lbl">Linked pots allocation</div><button class="fx-link" data-act="funding">Edit →</button></div>
      ${part.length ? h`<div class="col" style="gap:14px">${part.map((q) => h`<div><div class="fx-row fx-between"><span class="fx-row" style="gap:10px"><i class="fx-dot" style="background:${CLASS_INFO[q.cls]?.color}"></i><b>${q.name}</b>${q.pct < 1 ? h`<span class="fx-sub">${Math.round(q.pct * 100)}%</span>` : ''}</span><b>${inrC(q.v)}</b></div><div class="fx-bar" style="margin-top:6px;--fill:${CLASS_INFO[q.cls]?.color}"><i style="width:${(q.v / (part[0].v >= q.v ? part[0].v : q.v)) * 100}%"></i></div></div>`)}<div class="fx-row fx-between" style="border-top:1px solid var(--fx-line);padding-top:12px"><span class="fx-sub" style="font-size:15px">Total allocated</span><b style="font-size:19px">${inr(total)}</b></div></div>` : h`<div class="fx-sub">No pots are earmarked for this goal yet. Tap Edit to choose which holdings pay for it.</div>`}</div>
    ${!isRet ? h`<div class="fx-card"><div class="fx-lbl">Monthly saving</div><div class="fx-grid2" style="margin-top:10px">${tile('Required', reqM ? inrC(reqM) + '/mo' : '—', 'to close the gap')}${tile('You allocate', allocM ? inrC(allocM) + '/mo' : '₹0', g.stepUpPct ? `+${g.stepUpPct}% a year` : '')}</div><button class="fx-btn ghost small" data-act="alloc" style="margin-top:12px">Allocate more</button></div>` : ''}
    ${events.length ? h`<div class="fx-card"><div class="fx-lbl" style="margin-bottom:6px">Linked events</div><div class="fx-list">${events.map((e) => h`<a class="fx-li" href="#/fire/inputs/events"><span style="font-size:20px">📌</span><span class="grow"><b>${e.name}</b><div class="fx-sub">${monthYear(e.date)}</div></span>${IC.chev}</a>`)}</div></div>` : ''}
    <div class="fx-card warn" style="padding:16px"><div class="fx-row" style="gap:10px;color:var(--fx2);font-weight:800"><span>ⓘ</span>What-if analysis</div>${whatIfHtml(g, x, isRet)}</div>
    ${g.notes ? h`<div class="fx-card"><div class="fx-lbl">Notes</div><p style="margin-top:6px">${g.notes}</p></div>` : ''}
    <div class="fx-row" style="gap:10px"><button class="fx-btn ghost" data-act="arch" style="flex:1">Archive</button>${isRet ? '' : h`<button class="fx-btn danger" data-act="del" style="flex:1">Remove</button>`}</div>${fxNav('goals')}</div>`;
  html(root, body);
  const wi = { target: Number(g.target) || x.needed, alloc: allocM };
  bind(root, { click: {
    edit: () => editGoal(id), funding: () => fundingSheet(g, res), alloc: () => allocateSheet(res),
    arch: () => { FS.edit('goals', (gs) => gs.map((q) => (q.id === id ? { ...q, archived: true } : q)), { immediate: true }); undoToast('Goal archived', () => FS.undo()); location.hash = '#/fire/goals'; }, del: () => removeGoal(id),
    wiapply: () => { FS.edit('goals', (gs) => gs.map((q) => (q.id === id ? { ...q, ...(isRet ? {} : { target: wi.target }), monthlyAlloc: wi.alloc } : q)), { immediate: true }); toast('Applied'); },
    wireset: () => X.redraw(),
  }, input: { wi: (el) => { wi[el.dataset.k] = Number(el.value); const p2 = { ...plan, goals: plan.goals.map((q) => (q.id === id ? { ...q, ...(isRet ? {} : { target: wi.target }), monthlyAlloc: wi.alloc } : q)) }; const r = runPlan(p2, { today: X.today() }).goals.find((q) => q.id === id); root.querySelector(`[data-wv="${el.dataset.k}"]`).textContent = el.dataset.k === 'target' ? inr(wi.target) : `${inrC(wi.alloc)}/mo`; root.querySelector('#wires').innerHTML = `${pc(r.pct)} funded · <b class="${r.pct >= 1 ? 'ok' : 'warn'}">${r.status === 'behind' ? 'Behind' : r.status === 'ahead' ? 'Ahead' : 'On track'}</b>${r.gap > 0 ? ` · gap ${inrC(r.gap)}` : ''}`; } } });
}
function whatIfHtml(g, x, isRet) {
  const t = Number(g.target) || x.needed, a = Number(g.monthlyAlloc) || 0;
  return h`<div class="col" style="gap:12px;margin-top:10px">${isRet ? '' : h`<div><div class="fx-row fx-between"><span class="fx-sub">Target amount</span><b data-wv="target" class="pur">${inr(t)}</b></div><input type="range" class="fx-slider" data-act="wi" data-k="target" min="${Math.round(t * 0.5)}" max="${Math.round(t * 2)}" step="${Math.max(1000, Math.round(t / 100))}" value="${t}"></div>`}
    <div><div class="fx-row fx-between"><span class="fx-sub">Monthly allocation</span><b data-wv="alloc" class="pur">${inrC(a)}/mo</b></div><input type="range" class="fx-slider" data-act="wi" data-k="alloc" min="0" max="${Math.max(50000, a * 3)}" step="500" value="${a}"></div>
    <div class="fx-row fx-between"><span class="fx-sub" id="wires">${pc(x.pct)} funded</span><span class="fx-row" style="gap:10px"><button class="fx-link" data-act="wireset">Reset</button><button class="fx-btn small" data-act="wiapply">Apply</button></span></div></div>`;
}

// ------------------------------------------------------------------------------------------ dialogs
export function editGoal(id) {
  const plan = X.getPlan(), g = id ? plan.goals.find((x) => x.id === id) : null, isRet = g?.kind === 'retirement';
  const people = plan.profile.people;
  openForm({ title: g ? `Edit ${g.name}` : 'Add goal', sub: g ? '' : 'Something the money has to pay for',
    values: { kind: g?.kind || 'education', name: g?.name || '', icon: g?.icon || GOAL_KINDS.education.icon, color: g?.color || GOAL_KINDS.education.color, target: g?.target ?? null, when: g?.atAge ? 'age' : 'date', date: g?.date || '', atAge: g?.atAge ?? null, person: g?.person || people[0].id, inflationGroup: g?.inflationGroup || 'education', monthlyAlloc: g?.monthlyAlloc || null, stepUpPct: g?.stepUpPct ?? 0, notes: g?.notes || '' },
    fields: [...(isRet ? [] : [{ name: 'kind', label: 'Goal type', type: 'chips', options: Object.entries(GOAL_KINDS).filter(([k]) => k !== 'retirement').map(([k, v]) => [k, `${v.icon} ${v.label}`]) }]),
      { name: 'name', label: 'Name', type: 'text', required: true, maxlength: 40 },
      { type: 'row', fields: [{ name: 'icon', label: 'Icon', type: 'text', maxlength: 4 }, { name: 'color', label: 'Colour', type: 'select', options: SWATCH.map((c) => [c, c]) }] },
      ...(isRet ? [{ type: 'note', text: 'The retirement target is calculated from your spending. Set an amount below only to override it.' }] : []),
      { name: 'target', label: isRet ? 'Override target (optional)' : (g?.kind === 'emergency' ? 'Target (blank = months of spending)' : "Target amount, today's money"), type: 'money', min: 0, required: !isRet && (g?.kind || 'x') !== 'emergency' },
      ...(isRet ? [] : [{ name: 'when', label: 'When', type: 'chips', options: [['date', 'On a date'], ['age', 'At an age']] }, { name: 'date', label: 'Month and year', type: 'month', show: (v) => v.when === 'date' },
        { type: 'row', fields: [{ name: 'atAge', label: 'At age', type: 'num', min: 18, max: 100, show: (v) => v.when === 'age' }, { name: 'person', label: 'Person', type: 'select', options: people.map((p) => [p.id, p.name || 'Person']), show: (v) => v.when === 'age' }] },
        { name: 'inflationGroup', label: 'Inflation group', type: 'select', options: GROUPS.map((q) => [q, GROUP_LABEL[q]]) },
        { type: 'row', fields: [{ name: 'monthlyAlloc', label: 'Monthly saving for it', type: 'money', min: 0 }, { name: 'stepUpPct', label: 'Yearly increase', type: 'pct', min: 0, max: 30 }] }]),
      { name: 'notes', label: 'Notes', type: 'textarea' }],
    validate: (v) => (!isRet && g?.kind !== 'emergency' && v.kind !== 'emergency' && ((v.when === 'date' && !v.date) || (v.when === 'age' && !v.atAge)) ? 'Choose when the money is needed' : ''),
    onDelete: g && !isRet ? () => { removeGoal(id); } : null, deleteLabel: 'Remove goal', deleteTitle: 'Remove goal?', deleteText: 'Its funding plan stays, unlinked.',
    onSave: (v) => {
      const kind = isRet ? 'retirement' : v.kind, def = GOAL_KINDS[kind];
      const row = { ...(g || { id: uid('g_'), priority: plan.goals.length + 1 }), kind, name: v.name, icon: v.icon || def.icon, color: v.color || def.color, target: v.target, notes: v.notes, inflationGroup: v.inflationGroup || def.group, monthlyAlloc: v.monthlyAlloc || 0, stepUpPct: v.stepUpPct || 0, ...(isRet ? {} : v.when === 'age' ? { atAge: v.atAge, person: v.person, date: null } : { date: v.date || null, atAge: null }) };
      FS.edit('goals', (gs) => (g ? gs.map((x) => (x.id === g.id ? row : x)) : [...gs, row]), { immediate: true }); if (!g) toast('Goal added');
    } });
}

/** Choose how much of each holding pays for this goal. The rest of a holding falls to retirement automatically. */
export function fundingSheet(goal, res) {
  const plan = X.getPlan(), mh = Object.fromEntries(res.model.holdings.filter((q) => !q.virtual).map((q) => [q.id, q]));
  const fields = plan.holdings.filter((x) => x.include !== false).map((x) => ({ name: 'h_' + x.id, label: `${x.name} · ${inrC(holdingValue(x))}`, type: 'pct', min: 0, max: 100 }));
  const values = {}; for (const x of plan.holdings) values['h_' + x.id] = Math.round((mh[x.id]?.split[goal.id] || 0) * 100);
  if (!fields.length) return toast('Add holdings first (Inputs → Assets)', true);
  openForm({ title: `Funding for ${goal.name}`, sub: 'What share of each holding pays for this goal? Whatever you do not assign goes to retirement.', fields, values,
    validate: (v) => { for (const x of plan.holdings) { const others = Object.entries(x.goalSplit || {}).filter(([k]) => k !== goal.id && k !== 'g_ret').reduce((s, [, p]) => s + Number(p), 0); if (goal.kind !== 'retirement' && (v['h_' + x.id] || 0) + others > 100) return `${x.name}: more than 100% is assigned across goals`; } return ''; },
    onSave: (v) => FS.edit('holdings', (hs) => hs.map((x) => { const p = v['h_' + x.id] || 0, gs = { ...(x.goalSplit || {}) }; if (p > 0) gs[goal.id] = p; else delete gs[goal.id]; return { ...x, goalSplit: gs }; }), { immediate: true }) });
}

/** Split the monthly saving that is free after spending, EMIs and SIPs across goals. */
export function allocateSheet(res) {
  const plan = X.getPlan(), goals = plan.goals.filter((g) => !g.archived), cur = Object.fromEntries(goals.map((g) => [g.id, Number(g.monthlyAlloc) || 0]));
  const allocated = Object.values(cur).reduce((s, v) => s + v, 0), available = Math.max(0, res.meta.freeCash) + allocated, req = Object.fromEntries(res.goals.map((x) => [x.id, x.requiredMonthly || 0]));
  const st = { ...cur }; const tot = () => Object.values(st).reduce((s, v) => s + v, 0);
  const body = () => h`<div class="fx-sheet-h"><div><h1>Allocate monthly saving</h1><div class="fx-sub">Available: <b>${inrC(available)}</b> (income left after spending, EMIs and SIPs)</div></div><button class="iconbtn" data-act="close" aria-label="Close">${IC.close}</button></div>
    <div class="fx-split" style="height:14px">${goals.filter((g) => st[g.id] > 0).map((g) => h`<i style="flex:${st[g.id]};background:${g.color}"></i>`)}<i style="flex:${Math.max(0.0001, available - tot())};background:var(--fx-tile)"></i></div>
    <div class="fx-row fx-between fx-sub" id="al-sum"><span>${inrC(tot())} allocated</span><span class="${tot() > available ? 'bad' : ''}">${tot() > available ? `${inrC(tot() - available)} over` : `${inrC(available - tot())} left`}</span></div>
    <div class="col" style="gap:14px">${goals.map((g) => h`<div><div class="fx-row fx-between"><b>${g.icon} ${g.name}</b><b class="pur" data-av="${g.id}">${inrC(st[g.id])}/mo</b></div><input type="range" class="fx-slider" data-k="${g.id}" min="0" max="${Math.max(25000, Math.round(available))}" step="500" value="${st[g.id]}">${req[g.id] ? h`<div class="fx-help">Needs about ${inrC(req[g.id])}/mo to be fully funded</div>` : ''}</div>`)}</div>
    <div class="fx-err" id="al-err"></div><div class="fx-row"><button class="fx-btn ghost" data-act="auto" style="flex:1">Auto-balance</button><button class="fx-btn" data-act="save" style="flex:1">Save</button></div>`;
  const s = sheet(body(), { click: {
    auto: () => { let left = available; for (const g of [...goals].sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99))) { const give = Math.min(left, Math.ceil((req[g.id] || 0) / 500) * 500); st[g.id] = give; left -= give; } const sh = s.el.querySelector('.sheet'); sh.innerHTML = `<div class="grab"></div>${body().s}`; },
    save: () => { if (tot() > available + 1) { s.el.querySelector('#al-err').textContent = 'The total is more than what is available'; return; } FS.edit('goals', (gs) => gs.map((g) => ({ ...g, monthlyAlloc: st[g.id] ?? g.monthlyAlloc })), { immediate: true }); s.close(); toast('Saved'); } } });
  s.el.addEventListener('input', (e) => { const id = e.target.dataset?.k; if (!id) return; st[id] = Number(e.target.value); s.el.querySelector(`[data-av="${id}"]`).textContent = `${inrC(st[id])}/mo`; s.el.querySelector('#al-sum').innerHTML = `<span>${inrC(tot())} allocated</span><span class="${tot() > available ? 'bad' : ''}">${tot() > available ? `${inrC(tot() - available)} over` : `${inrC(available - tot())} left`}</span>`; });
}
export { raw, chip, note, srcChip, openInfo, errToast };
