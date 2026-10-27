// Screens: Inputs hub, Profile, Income, Assumptions. (Spending, Assets, Loans, Insurance, Life events live in sibling files.)
import { h, raw, bind, IC, chip, statusChip, tile, note, bar, head, fxNav, srcChip, openForm, openNumber, toast, undoToast, sheet, confirmSheet, errToast } from './ui.js';
import { html } from '../core.js';
import * as FS from './store.js';
import * as X from './ctx.js';
import * as D from './duet.js';
import { CLASSES, CLASS_INFO, DEFAULT_ASSUMPTIONS, INCOME_SOURCES, uid } from './defaults.js';
import { inr, inrC, inrF, pc, pp, yrs, dmy, ago } from './format.js';
import { sectionHealth, SECTION_META } from './health.js';
import { birthYearOf } from './engine.js';
import { openApplyDuet } from './duetsync.js';

let hubFilter = 'all';
const LOADERS = { spending: () => import('./inputs-spend.js').then((m) => m.spendingScreen), assets: () => import('./inputs-assets.js').then((m) => m.assetsScreen), loans: () => import('./inputs-fin.js').then((m) => m.loansScreen),
  insurance: () => import('./inputs-fin.js').then((m) => m.insuranceScreen), events: () => import('./inputs-fin.js').then((m) => m.eventsScreen), profile: () => Promise.resolve(profileScreen), income: () => Promise.resolve(incomeScreen), assumptions: () => Promise.resolve(assumptionsScreen) };

export async function inputs(root, { parts }) {
  const sec = parts[0]; if (sec && LOADERS[sec]) return (await LOADERS[sec]())(root);
  const plan = X.getPlan(), today = X.today(), hl = sectionHealth(plan, today), props = D.hasDuet() ? D.proposals(plan, today) : [];
  const list = hubFilter === 'attn' ? hl.list.filter((s) => s.status !== 'ok') : hl.list;
  const fix = (s) => s.status !== 'ok';
  html(root, h`<div class="fx">${head({ kicker: 'FIRE PLANNER', title: 'Inputs', right: h`<span class="fx-chip ${hl.done === hl.total ? 'ok' : 'warn'}" style="flex-direction:column;gap:0;padding:6px 12px;border-radius:16px"><b>${hl.done} / ${hl.total}</b><span style="font-size:11px;font-weight:600">complete</span></span>` })}
    <div><div class="fx-bar" style="height:6px"><i style="width:${hl.pct * 100}%"></i></div><div class="fx-sub" style="margin-top:6px">${Math.round(hl.pct * 100)}% complete${hl.needing.length ? ` — ${hl.needing.length} section${hl.needing.length > 1 ? 's' : ''} need attention` : ' — everything is filled in'}</div></div>
    <div class="fx-chips">${[['all', 'All'], ['attn', 'Needs attention']].map(([k, l]) => h`<button class="fx-opt ${hubFilter === k ? 'on' : ''}" data-act="hf" data-k="${k}">${l}</button>`)}</div>
    ${list.map((s) => h`<a class="fx-hub ${fix(s) ? 'attn' : ''}" href="#/fire/inputs/${s.id}"><span class="fx-ico lg" style="background:${s.color};font-size:28px;width:58px;height:58px">${s.icon}</span><span class="grow"><div class="t">${s.label}</div><div class="s ${fix(s) && s.msg ? 'w' : ''}">${fix(s) && s.msg ? `⚠ ${s.msg}` : s.summary}</div></span><span class="fx-dot ${s.status === 'ok' ? 'ok' : s.status === 'missing' ? 'bad' : 'warn'}"></span>${IC.chev}</a>`)}
    ${!list.length ? h`<div class="fx-note"><span>🎉</span><div>Nothing needs attention.</div></div>` : ''}
    <div class="fx-card ghost fx-row fx-between" style="padding:14px 16px"><span class="fx-row" style="gap:12px"><span class="blue" style="width:26px;display:inline-flex">${IC.sync}</span><span><b class="blue">${D.hasDuet() ? 'Synced from Duet' : 'Duet not available'}</b><div class="fx-sub">${props.length ? `${props.length} update${props.length > 1 ? 's' : ''} available from your Duet entries` : 'Income, spending & assets match your Duet entries'}</div></span></span>${props.length ? h`<button class="fx-btn small" data-act="sync">Review</button>` : ''}</div>
    ${fxNav('inputs')}</div>`);
  bind(root, { click: { hf: (el) => { hubFilter = el.dataset.k; X.redraw(); }, sync: () => openApplyDuet() } });
}
const back = (kicker, title, extra = '') => head({ kicker, title, back: '#/fire/inputs', right: extra });

// ------------------------------------------------------------------------------------------ Profile
function profileScreen(root) {
  const plan = X.getPlan(), res = X.run(), m = res.meta, base = m.baseYear, people = plan.profile.people, kids = plan.profile.children || [], deps = plan.profile.dependants || [];
  const age = (p) => base - birthYearOf(p, base);
  const personCard = (p, i) => {
    const prim = i === 0, retYear = birthYearOf(p, base) + (p.retireAge ?? 50), together = !prim && p.retireTogether;
    return h`<div class="fx-card"><div class="fx-row" style="gap:14px"><span class="avatar" style="width:58px;height:58px;font-size:20px;border:0;background:${prim ? 'var(--fx)' : '#E879A0'}">${(p.name || '?')[0].toUpperCase()}</span><div class="grow"><b style="font-size:21px">${p.name || 'Person'}</b><div class="fx-sub">${prim ? 'Primary planner' : 'Partner / Spouse'}</div></div><button class="fx-btn small ghost" data-act="pedit" data-i="${i}" style="background:var(--fx-tile)">Edit</button></div>
      <div class="col" style="gap:10px;margin-top:14px">${tile('DATE OF BIRTH', h`<div class="fx-row fx-between"><span>${p.dob ? dmy(p.dob) : `Born ${birthYearOf(p, base)}`}</span><span class="fx-sub" style="font-weight:600">Age ${age(p)}</span></div>`)}
        ${prim ? h`<div class="fx-tile"><div class="l" style="letter-spacing:.06em;font-size:12px;text-transform:uppercase">TARGET RETIREMENT AGE</div><div class="fx-row fx-between" style="margin-top:6px;gap:10px"><div><span class="fx-mid pur">Age ${p.retireAge ?? 50}</span><div class="fx-sub">${retYear} · ${yrs(retYear - base)}</div></div><span class="fx-step"><button data-act="rage" data-i="${i}" data-d="-1" aria-label="Earlier">−</button><button data-act="rage" data-i="${i}" data-d="1" aria-label="Later">+</button></span></div></div>
          ${tile('PLANNING HORIZON (TILL AGE)', h`<div class="fx-row fx-between"><span>Age ${plan.profile.horizonAge}</span><span class="fx-sub" style="font-weight:600">${plan.profile.horizonAge - (p.retireAge ?? 50)} years post-FIRE</span></div>`)}`
        : h`${tile('WORKING STATUS', h`<div class="fx-row fx-between"><span class="${p.workStatus === 'working' ? 'ok' : ''}">${{ working: 'Working', homemaker: 'Homemaker', notworking: 'Not working', retired: 'Retired' }[p.workStatus] || 'Working'}</span>${p.workEndYear ? h`<span class="fx-sub warn" style="font-weight:600">Plans to stop ${p.workEndYear}</span>` : ''}</div>`)}
          <div class="fx-tile"><div class="l" style="letter-spacing:.06em;font-size:12px;text-transform:uppercase">RETIRE TOGETHER?</div><div class="fx-row fx-between" style="margin-top:6px"><b style="font-size:19px">${together ? `Yes — age ${retYear - birthYearOf(p, base) - birthYearOf(p, base) + birthYearOf(p, base) >= 0 ? (res.meta.retireYear - birthYearOf(p, base)) : p.retireAge}` : `No — age ${p.retireAge ?? 50}`}</b><button class="fx-toggle ${together ? 'on' : ''}" role="switch" aria-checked="${!!together}" data-act="rtog" data-i="${i}"></button></div></div>`}</div></div>`;
  };
  html(root, h`<div class="fx">${back('INPUTS · PROFILE', 'Your Profile')}${people.map(personCard)}
    ${people.length < 2 ? h`<button class="fx-add" data-act="addp">${IC.plus}<span>Add your partner</span></button>` : ''}
    <div class="fx-card"><div class="fx-lbl" style="margin-bottom:10px">Dependent children</div><div class="col" style="gap:10px">${kids.map((k) => h`<button class="fx-tile" data-act="kedit" data-id="${k.id}" style="text-align:left;${k.planned ? 'border:1.5px dashed var(--fx-line);background:transparent' : ''}"><div class="fx-row fx-between"><b style="${k.planned ? 'color:var(--muted)' : ''};font-size:17px">${k.name}</b><span class="fx-sub">${k.planned ? '' : `Born ${k.birthYear} · Age ${base - k.birthYear}`}</span>${k.planned ? chip('est', 'Estimate') : ''}</div><div class="fx-sub" style="margin-top:4px">${k.planned ? `Expected ${k.birthYear} · ${plan.events.some((e) => e.kind === 'baby') ? 'cost factored in' : 'add a Baby event to include the cost'}` : `Dependency until age ${k.dependentUntilAge ?? 25} → ${k.birthYear + (k.dependentUntilAge ?? 25)}`}</div></button>`)}${!kids.length ? h`<div class="fx-sub">No children added.</div>` : ''}</div><button class="fx-add" data-act="addk" style="margin-top:12px;padding:14px">${IC.plus}<span>Add a child</span></button></div>
    <div class="fx-card"><div class="fx-lbl" style="margin-bottom:10px">Other dependants (support you give)</div><div class="col" style="gap:10px">${deps.map((d) => h`<button class="fx-tile" data-act="dedit" data-id="${d.id}" style="text-align:left"><div class="fx-row fx-between"><b>${d.name}</b><b>${inrC(d.monthly)}/mo</b></div><div class="fx-sub">Until ${d.untilYear || 'further notice'}</div></button>`)}${!deps.length ? h`<div class="fx-sub">No one else depends on you for money.</div>` : ''}</div><button class="fx-add" data-act="addd" style="margin-top:12px;padding:14px">${IC.plus}<span>Add a dependant</span></button></div>
    ${fxNav('inputs')}</div>`);
  bind(root, { click: {
    pedit: (el) => personSheet(Number(el.dataset.i)), addp: () => personSheet(-1),
    rage: (el) => FS.edit('profile', (p) => { const q = p.people[Number(el.dataset.i)]; q.retireAge = Math.max(base - birthYearOf(q, base) + 1, Math.min(70, (q.retireAge ?? 50) + Number(el.dataset.d))); return p; }, { immediate: true }),
    rtog: (el) => FS.edit('profile', (p) => { const i = Number(el.dataset.i), q = p.people[i]; q.retireTogether = !q.retireTogether; if (q.retireTogether) q.retireAge = res.meta.retireYear - birthYearOf(q, base); return p; }, { immediate: true }),
    kedit: (el) => childSheet(el.dataset.id), addk: () => childSheet(), dedit: (el) => depSheet(el.dataset.id), addd: () => depSheet(),
  } });
}
export function personSheet(i) {
  const plan = X.getPlan(), p = i >= 0 ? plan.profile.people[i] : null, base = Number(X.today().slice(0, 4));
  openForm({ title: p ? `Edit ${p.name}` : 'Add your partner', values: { name: p?.name || '', dob: p?.dob || '', birthYear: p?.birthYear ?? (p ? null : base - 30), retireAge: p?.retireAge ?? 50, workStatus: p?.workStatus || 'working', workEndYear: p?.workEndYear ?? null },
    fields: [{ name: 'name', label: 'Name', type: 'text', required: true, maxlength: 40 }, { name: 'dob', label: 'Date of birth', type: 'date', help: 'Or just the year below' }, { name: 'birthYear', label: 'Birth year (if no exact date)', type: 'num', min: 1940, max: base, show: (v) => !v.dob },
      { name: 'retireAge', label: 'Target retirement age', type: 'num', min: 35, max: 75, required: true }, { name: 'workStatus', label: 'Working status', type: 'select', options: [['working', 'Working'], ['homemaker', 'Homemaker'], ['notworking', 'Not working now'], ['retired', 'Retired']] },
      { name: 'workEndYear', label: 'Plans to stop working in year', type: 'num', min: base, max: base + 50, show: (v) => v.workStatus === 'working' && i !== 0, help: 'Leave empty to work until retirement' }],
    validate: (v) => (!v.dob && !v.birthYear ? 'Enter a date of birth or a birth year' : ''),
    onSave: (v) => FS.edit('profile', (pr) => { const row = { ...(p || { id: uid('p'), role: 'partner' }), name: v.name, dob: v.dob || null, birthYear: v.dob ? null : v.birthYear, retireAge: v.retireAge, workStatus: v.workStatus, workEndYear: v.workEndYear || null }; pr.people = i >= 0 ? pr.people.map((x, k) => (k === i ? row : x)) : [...pr.people, row]; return pr; }, { immediate: true }) });
}
export function childSheet(id) {
  const plan = X.getPlan(), k = id ? plan.profile.children.find((x) => x.id === id) : null, base = Number(X.today().slice(0, 4));
  openForm({ title: k ? `Edit ${k.name}` : 'Add a child', values: { name: k?.name || '', birthYear: k?.birthYear ?? base, planned: !!k?.planned, dependentUntilAge: k?.dependentUntilAge ?? 25 },
    fields: [{ name: 'name', label: 'Name', type: 'text', required: true }, { name: 'planned', type: 'toggle', hint: 'Not born yet (planned)' }, { type: 'row', fields: [{ name: 'birthYear', label: 'Birth year', type: 'num', required: true, min: base - 30, max: base + 15 }, { name: 'dependentUntilAge', label: 'Dependent until age', type: 'num', min: 18, max: 40 }] }],
    onDelete: k ? () => { FS.edit('profile', (p) => { p.children = p.children.filter((x) => x.id !== id); return p; }, { immediate: true }); undoToast('Child removed', () => FS.undo()); } : null,
    onSave: (v) => FS.edit('profile', (p) => { const row = { ...(k || { id: uid('c') }), ...v }; p.children = k ? p.children.map((x) => (x.id === id ? row : x)) : [...(p.children || []), row]; return p; }, { immediate: true }) });
}
function depSheet(id) {
  const plan = X.getPlan(), d = id ? (plan.profile.dependants || []).find((x) => x.id === id) : null, base = Number(X.today().slice(0, 4));
  openForm({ title: d ? `Edit ${d.name}` : 'Add a dependant', sub: 'Money you send regularly, for example to parents',
    values: { name: d?.name || '', monthly: d?.monthly ?? null, untilYear: d?.untilYear ?? null }, fields: [{ name: 'name', label: 'Who', type: 'text', required: true }, { name: 'monthly', label: 'Per month (today\'s money)', type: 'money', required: true, min: 0 }, { name: 'untilYear', label: 'Until year (optional)', type: 'num', min: base, max: base + 60 }],
    onDelete: d ? () => { FS.edit('profile', (p) => { p.dependants = (p.dependants || []).filter((x) => x.id !== id); return p; }, { immediate: true }); undoToast('Removed', () => FS.undo()); } : null,
    onSave: (v) => FS.edit('profile', (p) => { const row = { ...(d || { id: uid('d') }), ...v }; p.dependants = d ? p.dependants.map((x) => (x.id === id ? row : x)) : [...(p.dependants || []), row]; return p; }, { immediate: true }) });
}

// ------------------------------------------------------------------------------------------ Income
function incomeScreen(root) {
  const plan = X.getPlan(), res = X.run(), base = res.meta.baseYear, people = plan.profile.people, today = X.today();
  const incs = plan.incomes, total = incs.filter((i) => i.include !== false).reduce((s, i) => s + (Number(i.takeHome) || 0), 0);
  const stop = (i) => plan.events.find((e) => e.kind === 'work_stop' && e.incomeId === i.id && e.enabled !== false);
  const owner = (i) => people.find((p) => p.id === i.person) || people[0];
  const card = (i) => {
    const o = owner(i), passive = i.type === 'passive', st = stop(i), until = i.untilYear ?? (passive ? null : (o === people[0] ? res.meta.retireYear : o.workEndYear ?? birthYearOf(o, base) + (o.retireAge ?? 50)));
    const dup = i.source === 'duet' ? 'duet' : 'entered';
    return h`<div class="fx-card"><div class="fx-row fx-between"><b style="font-size:19px">${i.label}</b><span class="fx-row" style="gap:10px">${srcChip(dup)}<button class="fx-link" data-act="iedit" data-id="${i.id}" aria-label="Edit ${i.label}" style="color:var(--muted)">${IC.edit}</button></span></div>
      <div class="fx-tile" style="margin-top:12px"><div class="l" style="text-transform:uppercase;letter-spacing:.06em;font-size:12px">${passive ? 'MONTHLY AMOUNT' : 'MONTHLY TAKE-HOME'}</div><div class="fx-big" style="font-size:clamp(26px,8vw,34px);margin:4px 0">${inrF(i.takeHome)}</div>
        ${st ? h`<div class="warn">⚠ ${st.name} ${dmy(st.date)}</div>` : h`<div class="fx-sub">${passive ? (i.continuesPostRetirement ? 'Continues post-retirement' : 'Stops at retirement') : i.gross ? `Gross ${inrF(i.gross)} · Tax ~${Math.round((1 - i.takeHome / i.gross) * 100)}%` : 'Take-home after tax'}</div>`}</div>
      <div class="fx-grid2" style="margin-top:10px"><div class="fx-tile"><div class="l">${passive ? 'Growth rate' : 'Income CAGR'}</div><div class="fx-row fx-between" style="margin-top:6px"><span class="fx-mid">${i.growthPct ?? plan.assumptions.salaryGrowth}%${passive ? '/yr' : ''}</span><span class="fx-step"><button data-act="ig" data-id="${i.id}" data-d="-1" aria-label="Lower growth">−</button><button data-act="ig" data-id="${i.id}" data-d="1" aria-label="Higher growth">+</button></span></div></div>
        ${passive ? tile('Income type', h`<span class="ok">Passive</span>`, i.sourceTag || '') : tile('Working till', h`<span class="${st || i.untilYear ? 'warn' : ''}">${until}</span>`, `Age ${until - birthYearOf(o, base)}`)}</div></div>`;
  };
  const cats = D.hasDuet() ? Object.entries(D.duetAverage(plan, today, 3).byIncomeCat || {}).filter(([, v]) => v > 0) : [];
  html(root, h`<div class="fx">${back('INPUTS · INCOME', 'Income Sources')}
    <div class="fx-card good" style="padding:16px"><div class="ok" style="font-weight:800;letter-spacing:.06em;font-size:13px">TOTAL HOUSEHOLD INCOME</div><div class="fx-row fx-between" style="margin-top:6px;align-items:flex-end"><div><span class="fx-big" style="font-size:clamp(26px,8vw,36px)">${inrF(total)}</span> <span class="fx-sub">/mo</span><div class="fx-sub">${inrC(total * 12).replace('L', 'L')}/yr · Take-home after tax</div></div>${srcChip(incs.some((i) => i.source === 'duet') ? 'duet' : 'entered')}</div></div>
    ${incs.map(card)}
    ${cats.length && !incs.some((i) => i.duetCategory) ? h`<div class="fx-note purple"><span>🔗</span><div>Duet sees income entries: ${cats.map(([c, v]) => `${c} ${inrC(v)}/mo`).join(', ')}. Link one to an income source above so the plan can follow your real pay.</div></div>` : ''}
    <button class="fx-add" data-act="iadd">${IC.plus}<span>Add income source</span></button>${fxNav('inputs')}</div>`);
  bind(root, { click: { iedit: (el) => incomeSheet(el.dataset.id), iadd: () => incomeSheet(),
    ig: (el) => FS.edit('incomes', (l) => l.map((i) => (i.id === el.dataset.id ? { ...i, growthPct: Math.max(0, Math.min(25, (i.growthPct ?? plan.assumptions.salaryGrowth) + Number(el.dataset.d))) } : i)), { immediate: true }) } });
}
export function incomeSheet(id) {
  const plan = X.getPlan(), i = id ? plan.incomes.find((x) => x.id === id) : null, people = plan.profile.people, base = Number(X.today().slice(0, 4));
  const duetCats = D.hasDuet() ? [...new Set((X.getPlan() && D.hasDuet() ? Object.keys(D.duetStats(plan, X.today(), '12m').totals.byIncomeCat || {}) : []))] : [];
  openForm({ title: i ? `Edit ${i.label}` : 'Add income source', values: { label: i?.label || '', person: i?.person || people[0].id, type: i?.type || 'active', sourceTag: i?.sourceTag || 'Salary', takeHome: i?.takeHome ?? null, gross: i?.gross ?? null, growthPct: i?.growthPct ?? plan.assumptions.salaryGrowth, frequency: i?.frequency || 'monthly', untilYear: i?.untilYear ?? null, startDate: i?.startDate || '', continuesPostRetirement: !!i?.continuesPostRetirement, nature: i?.nature || [], duetCategory: i?.duetCategory || '', include: i?.include !== false },
    fields: [{ name: 'label', label: 'Name', type: 'text', required: true, maxlength: 40, placeholder: 'Your name · Salary' }, { type: 'row', fields: [{ name: 'person', label: 'Whose', type: 'select', options: people.map((p) => [p.id, p.name]) }, { name: 'type', label: 'Type', type: 'select', options: [['active', 'Active (work)'], ['passive', 'Passive']] }] },
      { name: 'sourceTag', label: 'Source', type: 'chips', options: INCOME_SOURCES.map((s) => [s, s]) },
      { name: 'nature', label: 'Tags', type: 'multi', options: [['recurring', 'Recurring'], ['oneoff', 'One-off'], ['fixed', 'Fixed'], ['variable', 'Variable'], ['taxable', 'Taxable'], ['taxfree', 'Tax-free']] },
      { type: 'row', fields: [{ name: 'takeHome', label: 'Monthly take-home', type: 'money', required: true, min: 0 }, { name: 'gross', label: 'Gross (optional)', type: 'money', min: 0 }] },
      { type: 'row', fields: [{ name: 'growthPct', label: 'Yearly growth', type: 'pct', min: 0, max: 30 }, { name: 'frequency', label: 'Paid', type: 'select', options: [['monthly', 'Monthly'], ['quarterly', 'Quarterly'], ['yearly', 'Yearly'], ['once', 'One-time']] }] },
      { type: 'row', fields: [{ name: 'startDate', label: 'Starts (optional)', type: 'month' }, { name: 'untilYear', label: 'Stops in year', type: 'num', min: base, max: base + 60, help: 'Empty = at retirement' }] },
      { name: 'continuesPostRetirement', type: 'toggle', hint: 'Continues after retirement', show: (v) => v.type === 'passive' },
      ...(duetCats.length ? [{ name: 'duetCategory', label: 'Follow Duet income category', type: 'select', options: [['', 'None'], ...duetCats.map((c) => [c, c])], help: 'The plan can then use your real monthly average' }] : []),
      { name: 'include', type: 'toggle', hint: 'Include in the plan' }],
    onDelete: i ? () => { FS.edit('incomes', (l) => l.filter((x) => x.id !== id), { immediate: true }); undoToast('Income removed', () => FS.undo()); } : null,
    onSave: (v) => { const row = { ...(i || { id: uid('i') }), ...v, source: i?.source || 'entered' }; if (v.duetCategory) row.source = 'duet'; FS.edit('incomes', (l) => (i ? l.map((x) => (x.id === id ? row : x)) : [...l, row]), { immediate: true }); } });
}

// ------------------------------------------------------------------------------------------ Assumptions
const stepRow = (label, sub, path, v, step, min, max, color = '') => h`<div class="fx-tile"><div class="fx-row fx-between" style="gap:10px"><div class="grow"><b style="font-size:17px">${label}</b>${sub ? h`<div class="fx-sub">${sub}</div>` : ''}</div><div class="fx-step sm"><button data-act="st" data-p="${path}" data-s="${step}" data-min="${min}" data-max="${max}" data-d="-1" aria-label="Lower ${label}">−</button><span class="n" style="${color ? `color:${color}` : ''}">${v}%</span><button data-act="st" data-p="${path}" data-s="${step}" data-min="${min}" data-max="${max}" data-d="1" aria-label="Higher ${label}">+</button></div></div></div>`;
function assumptionsScreen(root) {
  const plan = X.getPlan(), A = plan.assumptions, res = X.run(), t = res.target, m = res.meta;
  const classRows = CLASSES.filter((c) => c !== 'other').map((c) => stepRow(CLASS_INFO[c].label, '', `returns.${c}`, A.returns[c], 0.5, 0, 25, CLASS_INFO[c].color));
  const retW = A.retirementAllocation, tot = Object.values(retW).reduce((s, v) => s + v, 0) || 100;
  html(root, h`<div class="fx">${back('INPUTS', 'Assumptions', h`<button class="fx-ib" data-act="reset">Reset</button>`)}
    <div class="fx-note warn"><span>ⓘ</span><div>These are your FIRE plan's economic assumptions. Small changes here have a large impact on the projection outcome. Changes save automatically.</div></div>
    <div class="fx-card"><div class="fx-lbl" style="margin-bottom:10px">Inflation</div><div class="col" style="gap:10px">${stepRow('General inflation', 'Used for spending projections', 'inflation.general', A.inflation.general, 0.5, 2, 12)}${stepRow('Healthcare inflation', 'Applied to medical costs post-FIRE', 'inflation.medical', A.inflation.medical, 0.5, 2, 15, 'var(--fx-bad)')}${stepRow('Education inflation', 'School and college costs', 'inflation.education', A.inflation.education, 0.5, 2, 15)}${stepRow('Housing inflation', 'Rent and upkeep', 'inflation.housing', A.inflation.housing, 0.5, 2, 12)}</div></div>
    <div class="fx-card"><div class="fx-lbl" style="margin-bottom:10px">Expected returns</div><div class="col" style="gap:8px">${classRows}</div><div class="fx-sub" style="margin-top:10px">Nominal yearly returns before inflation. Return on new savings: <b>${A.newMoneyReturn}%</b> <button class="fx-link" data-act="nmr">change</button></div></div>
    <div class="fx-card"><div class="fx-lbl" style="margin-bottom:10px">Withdrawal & tax</div><div class="col" style="gap:10px">
      <div class="fx-tile"><div class="fx-row fx-between"><div class="grow"><b style="font-size:17px">Safe Withdrawal Rate</b><div class="fx-sub">Annual draw-down from corpus</div></div><div class="fx-step sm"><button data-act="st" data-p="swr" data-s="0.25" data-min="2" data-max="6" data-d="-1" aria-label="Lower rate">−</button><span class="n">${A.swr}%</span><button data-act="st" data-p="swr" data-s="0.25" data-min="2" data-max="6" data-d="1" aria-label="Higher rate">+</button></div></div>
        <div class="fx-sub" style="margin-top:8px">Implies corpus: ${inrC(t.monthlyToday)} × 12 / ${(A.swr / 100).toFixed(3)} = <b class="pur">${inr(t.classicAt)}</b> · The year-by-year target is <b class="pur">${inr(t.total)}</b> (today's)${t.passiveAtRet ? ' with passive income offset' : ''}</div></div>
      ${stepRow('Effective tax rate', 'On gains in redemptions', 'taxPct', A.taxPct, 1, 0, 45)}${stepRow('Share of a withdrawal that is gain', 'Only this part is taxed', 'gainSharePct', A.gainSharePct, 5, 0, 100)}</div></div>
    <div class="fx-card"><div class="fx-lbl" style="margin-bottom:10px">Growth & other</div><div class="col" style="gap:10px">${stepRow('Income growth', 'Default for new income sources', 'salaryGrowth', A.salaryGrowth, 0.5, 0, 20)}
      <div class="fx-tile"><div class="fx-row fx-between"><div class="grow"><b style="font-size:17px">Emergency buffer</b><div class="fx-sub">Months of spending kept in cash</div></div><div class="fx-step sm"><button data-act="st" data-p="bufferMonths" data-s="1" data-min="1" data-max="24" data-d="-1" data-raw="1">−</button><span class="n">${A.bufferMonths}</span><button data-act="st" data-p="bufferMonths" data-s="1" data-min="1" data-max="24" data-d="1" data-raw="1">+</button></div></div></div>
      <div class="fx-tile"><div class="fx-row fx-between"><div class="grow"><b style="font-size:17px">Lifestyle inflation</b><div class="fx-sub">Spending grows ${A.lifestyleInflation?.pct ?? 2}% a year beyond inflation</div></div><button class="fx-toggle ${A.lifestyleInflation?.on ? 'on' : ''}" role="switch" aria-checked="${!!A.lifestyleInflation?.on}" data-act="ls"></button></div></div>
      <button class="fx-tile" data-act="alloc" style="text-align:left"><b style="font-size:17px">Retirement portfolio mix</b><div class="fx-sub">${Object.entries(retW).filter(([, v]) => v > 0).map(([c, v]) => `${CLASS_INFO[c].short} ${Math.round((v / tot) * 100)}%`).join(' · ')} → ${t.retNom.toFixed(1)}% nominal, ${(t.rRet * 100).toFixed(1)}% real</div></button></div></div>
    ${fxNav('inputs')}</div>`);
  const getP = (o, p) => p.split('.').reduce((a, k) => a[k], o), setP = (o, p, v) => { const ks = p.split('.'), last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; };
  bind(root, { click: {
    st: (el) => { const p = el.dataset.p, s = Number(el.dataset.s), d = Number(el.dataset.d), lo = Number(el.dataset.min), hi = Number(el.dataset.max); FS.edit('assumptions', (a) => { setP(a, p, Math.max(lo, Math.min(hi, +(getP(a, p) + d * s).toFixed(3)))); return a; }, { immediate: true }); },
    ls: () => FS.edit('assumptions', (a) => { a.lifestyleInflation = { pct: a.lifestyleInflation?.pct ?? 2, on: !a.lifestyleInflation?.on }; return a; }, { immediate: true }),
    nmr: () => openForm({ title: 'Return on new savings', sub: 'Used for extra saving, freed EMIs and goal contributions', fields: [{ name: 'v', label: 'Yearly return', type: 'pct', required: true, min: 0, max: 25 }], values: { v: A.newMoneyReturn }, onSave: (v) => FS.edit('assumptions', (a) => { a.newMoneyReturn = v.v; return a; }, { immediate: true }) }),
    alloc: () => openForm({ title: 'Retirement portfolio mix', sub: 'How your corpus is invested once you retire (must add up to 100%)', values: { equity: retW.equity || 0, hybrid: retW.hybrid || 0, debt: retW.debt || 0, cash: retW.cash || 0 }, fields: ['equity', 'hybrid', 'debt', 'cash'].map((c) => ({ name: c, label: CLASS_INFO[c].label, type: 'pct', min: 0, max: 100 })),
      validate: (v) => (Math.round((v.equity || 0) + (v.hybrid || 0) + (v.debt || 0) + (v.cash || 0)) !== 100 ? 'The mix must add up to 100%' : ''), onSave: (v) => FS.edit('assumptions', (a) => { a.retirementAllocation = { equity: v.equity || 0, hybrid: v.hybrid || 0, debt: v.debt || 0, cash: v.cash || 0 }; return a; }, { immediate: true }) }),
    reset: async () => { if (await confirmSheet('Reset assumptions?', 'Inflation, returns, withdrawal rate, tax and the retirement mix go back to defaults.', 'Reset')) { FS.edit('assumptions', () => JSON.parse(JSON.stringify(DEFAULT_ASSUMPTIONS)), { immediate: true }); undoToast('Assumptions reset', () => FS.undo()); } },
  } });
}
export { raw, statusChip, note, bar, openNumber, errToast, sheet, pc, pp, ago, SECTION_META };
