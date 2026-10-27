// Screen: Inputs · Spending. What the household spends now, what it needs after retirement, and how Duet categories map in.
import { h, bind, IC, tile, note, head, fxNav, srcChip, openForm, undoToast } from './ui.js';
import { html } from '../core.js';
import * as FS from './store.js';
import * as X from './ctx.js';
import * as D from './duet.js';
import { GROUPS, GROUP_LABEL, SPEND_BUCKETS, uid } from './defaults.js';
import { inrC, inrF, pc } from './format.js';
import { openApplyDuet } from './duetsync.js';

const sum = (a) => a.reduce((s, x) => s + x, 0);
const total = (plan) => Number(plan.spending.currentMonthly) || sum((plan.spending.categories || []).map((c) => Number(c.monthly) || 0));
const setTotal = (sp) => { sp.currentMonthly = sum((sp.categories || []).map((c) => Number(c.monthly) || 0)); return sp; };

export function spendingScreen(root) {
  const plan = X.getPlan(), today = X.today(), sp = plan.spending, cats = sp.categories || [], now = total(plan), res = X.run();
  const av = D.hasDuet() ? D.duetAverage(plan, today, 3) : null, retire = sp.retirement?.monthly, nonEdu = sum(cats.filter((c) => c.group !== 'education').map((c) => Number(c.monthly) || 0)) || now;
  const retMonthly = retire ?? nonEdu, ratio = nonEdu ? retMonthly / nonEdu : 1, housing = sp.housing || 'rent';
  const row = (c) => h`<button class="fx-li" data-act="cedit" data-id="${c.id}" style="align-items:center"><span class="fx-ico" style="background:${c.color || '#8B97B3'}22;color:${c.color || '#8B97B3'}">${c.icon || '🛒'}</span><span class="grow"><b>${c.name}</b><div class="fx-sub">${GROUP_LABEL[c.group] || 'General living'}${c.source === 'duet' ? ' · from Duet' : c.source === 'manual' ? ' · fixed by you' : ''}</div></span><span style="text-align:right"><b>${inrF(c.monthly)}</b><div class="fx-sub">${now ? pc((Number(c.monthly) || 0) / now) : ''}</div></span></button>`;
  html(root, h`<div class="fx">${head({ kicker: 'INPUTS · SPENDING', title: 'Spending', back: '#/fire/inputs', right: srcChip(cats.some((c) => c.source === 'duet') ? 'duet' : 'entered') })}
    <div class="fx-card"><div class="fx-lbl">TOTAL SPENDING NOW</div><div class="fx-big" style="font-size:clamp(28px,9vw,38px);margin:4px 0">${inrF(now)} <span class="fx-sub">/mo</span></div><div class="fx-sub">${inrC(now * 12)} a year · ${inrC(res.meta.takeHome ? res.meta.takeHome - now : 0)} left of take-home before saving</div>
      ${av && av.expense ? h`<div class="fx-note purple" style="margin-top:12px"><span>🔗</span><div>Duet shows about <b>${inrF(av.expense)}</b> a month over the last ${av.months || 3} month${av.months === 1 ? '' : 's'}. <button class="fx-link" data-act="duet">Compare & use</button></div></div>` : ''}</div>
    <div class="fx-card"><div class="fx-row fx-between" style="margin-bottom:10px"><div class="fx-lbl">CATEGORIES</div><span class="fx-sub">Tap to edit</span></div><div class="fx-list">${cats.map(row)}${!cats.length ? h`<div class="fx-sub" style="padding:8px 0">No categories yet. Add one, or pull them from Duet.</div>` : ''}</div>
      <button class="fx-add" data-act="cadd" style="margin-top:12px;padding:14px">${IC.plus}<span>Add category</span></button></div>
    <div class="fx-card"><div class="fx-lbl" style="margin-bottom:8px">SPENDING AFTER RETIREMENT</div>
      <div class="fx-tile"><div class="l">MONTHLY NEED (TODAY'S MONEY)</div><div class="fx-row fx-between" style="margin-top:6px;gap:10px"><button class="fx-mid pur" data-act="redit" style="text-align:left">${inrF(retMonthly)}</button><span class="fx-step"><button data-act="rstep" data-d="-1" aria-label="Lower spending">−</button><button data-act="rstep" data-d="1" aria-label="Raise spending">+</button></span></div>
        <div class="fx-sub" style="margin-top:6px">${retire == null ? 'Same as today (kids\' education excluded)' : `${ratio >= 1 ? '+' : '−'}${Math.abs(Math.round((ratio - 1) * 100))}% vs today's ${inrC(nonEdu)}`}${retire != null ? ' · ' : ''}${retire != null ? h`<button class="fx-link" data-act="rreset">Match today</button>` : ''}</div></div>
      <div class="fx-lbl" style="margin:14px 0 8px">HOUSING IN RETIREMENT</div>
      <div class="fx-chips">${[['rent', 'Keep renting'], ['own', 'Own the house'], ['custom', 'Custom']].map(([k, l]) => h`<button class="fx-opt ${housing === k ? 'on' : ''}" data-act="hs" data-k="${k}">${l}</button>`)}</div>
      <div class="fx-sub" style="margin-top:8px">${housing === 'rent' ? 'Rent keeps growing with housing inflation.' : housing === 'own' ? 'Only upkeep remains (about a quarter of today\'s rent).' : `Fixed housing cost: ${inrF(sp.housingMonthly || 0)}/mo`} ${housing === 'custom' ? h`<button class="fx-link" data-act="hm">change</button>` : ''}</div></div>
    ${D.hasDuet() ? h`<button class="fx-card" data-act="map" style="text-align:left;width:100%"><div class="fx-row fx-between"><span><b>Duet category mapping</b><div class="fx-sub">Choose which planner group each Duet category counts toward</div></span>${IC.chev}</div></button>` : ''}
    ${note('ⓘ', 'One-off expenses (a holiday, a gadget) can distort the average. Fix a category to your own number with "Keep my number" and Duet will not overwrite it.', 'purple')}
    ${fxNav('inputs')}</div>`);
  bind(root, { click: {
    duet: () => openApplyDuet({ only: 'Spending' }), cedit: (el) => catSheet(el.dataset.id), cadd: () => catSheet(),
    rstep: (el) => FS.edit('spending', (s) => { const base = s.retirement?.monthly ?? nonEdu; s.retirement = { ...(s.retirement || {}), monthly: Math.max(0, Math.round((base + Number(el.dataset.d) * 5000) / 1000) * 1000) }; return s; }, { immediate: true }),
    redit: () => openForm({ title: 'Monthly need after retirement', sub: 'In today\'s money. Inflation is added by the plan.', values: { v: retMonthly }, fields: [{ name: 'v', label: 'Per month', type: 'money', required: true, min: 0 }], onSave: (v) => FS.edit('spending', (s) => { s.retirement = { ...(s.retirement || {}), monthly: v.v }; return s; }, { immediate: true }) }),
    rreset: () => FS.edit('spending', (s) => { s.retirement = { ...(s.retirement || {}), monthly: null }; return s; }, { immediate: true }),
    hs: (el) => FS.edit('spending', (s) => { s.housing = el.dataset.k; return s; }, { immediate: true }),
    hm: () => openForm({ title: 'Housing cost in retirement', values: { v: sp.housingMonthly ?? null }, fields: [{ name: 'v', label: 'Per month (today\'s money)', type: 'money', required: true, min: 0 }], onSave: (v) => FS.edit('spending', (s) => { s.housingMonthly = v.v; return s; }, { immediate: true }) }),
    map: () => mapSheet(),
  } });
}

function catSheet(id) {
  const plan = X.getPlan(), c = id ? plan.spending.categories.find((x) => x.id === id) : null;
  openForm({ title: c ? `Edit ${c.name}` : 'Add category', values: { name: c?.name || '', icon: c?.icon || '🛒', group: c?.group || 'general', monthly: c?.monthly ?? null, keep: c?.source === 'manual' },
    fields: [{ type: 'row', fields: [{ name: 'icon', label: 'Icon', type: 'text', maxlength: 4 }, { name: 'name', label: 'Name', type: 'text', required: true, maxlength: 30 }] },
      { name: 'monthly', label: 'Per month', type: 'money', required: true, min: 0 },
      { name: 'group', label: 'Counts as', type: 'chips', options: GROUPS.map((g) => [g, GROUP_LABEL[g]]), help: 'Medical, education and housing grow at their own inflation rate' },
      { name: 'keep', type: 'toggle', hint: 'Keep my number (do not update from Duet)' }],
    onDelete: c ? () => { FS.edit('spending', (s) => setTotal({ ...s, categories: s.categories.filter((x) => x.id !== id) }), { immediate: true }); undoToast('Category removed', () => FS.undo()); } : null,
    onSave: (v) => FS.edit('spending', (s) => {
      const bucket = SPEND_BUCKETS.find((b) => b.id === c?.id), row = { ...(c || { id: uid('sc'), color: '#7C5FE6' }), name: v.name, icon: v.icon || '🛒', group: v.group, monthly: v.monthly, source: v.keep ? 'manual' : (c?.source === 'duet' ? 'duet' : 'entered') };
      void bucket; s.categories = c ? s.categories.map((x) => (x.id === id ? row : x)) : [...(s.categories || []), row]; return setTotal(s);
    }, { immediate: true }) });
}

function mapSheet() {
  const plan = X.getPlan(), names = D.categoryNames();
  if (!names.length) return openForm({ title: 'Duet category mapping', sub: 'No expense categories found in Duet yet.', fields: [], cta: 'OK', onSave: () => {} });
  const values = Object.fromEntries(names.map((n) => [n, D.bucketOf(plan, n)]));
  openForm({ title: 'Duet category mapping', sub: 'Pick the planner category each Duet category belongs to', values, fields: names.map((n) => ({ name: n, label: n, type: 'select', options: SPEND_BUCKETS.map((b) => [b.id, `${b.icon} ${b.name}`]) })),
    onSave: (v) => FS.edit('spending', (s) => { s.mapping = Object.fromEntries(names.map((n) => [n, v[n]])); return s; }, { immediate: true }) });
}
export { tile };
