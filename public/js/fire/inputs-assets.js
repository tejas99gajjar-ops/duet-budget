// Screen: Inputs · Assets & investments. Holdings with asset-class tags, SIPs, invested vs current value, buy/withdraw, Duet links.
import { h, bind, IC, chip, tile, note, head, fxNav, srcChip, sheet, openForm, undoToast, toast, errToast, confirmSheet } from './ui.js';
import { html } from '../core.js';
import * as FS from './store.js';
import * as X from './ctx.js';
import * as D from './duet.js';
import { CLASSES, CLASS_INFO, HOLDING_KINDS, KIND_DEFAULT_CLASS, SUBTYPES, uid } from './defaults.js';
import { holdingValue, birthYearOf } from './engine.js';
import { inr, inrC, inrF, pc, pp, monthYear, ago } from './format.js';

const sum = (a) => a.reduce((s, x) => s + x, 0);
let filter = 'all';
const clsOf = (hd) => (Array.isArray(hd.mix) && hd.mix.length > 1 ? 'mixed' : Array.isArray(hd.mix) && hd.mix.length ? hd.mix[0].cls : hd.assetClass || KIND_DEFAULT_CLASS[hd.kind] || 'equity');
const clsLabel = (c) => (c === 'mixed' ? 'Mixed' : CLASS_INFO[c]?.short || c);
const clsColor = (c) => (c === 'mixed' ? '#8B97B3' : CLASS_INFO[c]?.color || '#8B97B3');
const sipTotal = (hd) => sum((hd.sips || []).filter((s) => s.status !== 'paused' && s.status !== 'stopped').map((s) => Number(s.amount) || 0));
const stale = (hd) => hd.price != null && hd.priceAsOf && (Date.now() - new Date(hd.priceAsOf).getTime()) / 864e5 > 30;

export function assetsScreen(root) {
  const plan = X.getPlan(), people = plan.profile.people, hs = plan.holdings;
  const vals = hs.filter((x) => x.include !== false), totalV = sum(vals.map(holdingValue)), inv = sum(vals.map((x) => Number(x.invested) || 0)), invKnown = sum(vals.filter((x) => x.invested != null).map(holdingValue));
  const sips = sum(vals.map(sipTotal)), byCls = {}; for (const x of vals) { const m = Array.isArray(x.mix) && x.mix.length ? x.mix : [{ cls: clsOf(x), pct: 100 }], t = sum(m.map((q) => Number(q.pct) || 0)) || 100; for (const q of m) byCls[q.cls] = (byCls[q.cls] || 0) + holdingValue(x) * ((Number(q.pct) || 0) / t); }
  const classes = Object.entries(byCls).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const chips = [['all', 'All'], ...[...new Set(hs.map(clsOf))].map((c) => [c, clsLabel(c)]), ...(hs.some((x) => x.familyHeld) ? [['family', 'Family-held']] : [])];
  const list = hs.filter((x) => filter === 'all' || (filter === 'family' ? x.familyHeld : clsOf(x) === filter));
  const gain = invKnown ? sum(vals.filter((x) => x.invested != null).map(holdingValue)) - inv : null;
  const card = (x) => {
    const v = holdingValue(x), g = x.invested ? v - x.invested : null, own = people.find((p) => p.id === x.owner), s = sipTotal(x), paused = (x.sips || []).some((q) => q.status === 'paused'), c = clsOf(x);
    return h`<button class="fx-card" data-act="hd" data-id="${x.id}" style="text-align:left;width:100%;${x.include === false ? 'opacity:.55' : ''}"><div class="fx-row fx-between" style="gap:10px;align-items:flex-start"><div class="grow" style="min-width:0"><b style="font-size:18px">${x.name}</b><div class="fx-row" style="gap:6px;margin-top:6px;flex-wrap:wrap"><span class="fx-chip" style="background:${clsColor(c)}22;color:${clsColor(c)}">${clsLabel(c)}</span><span class="fx-chip">${HOLDING_KINDS[x.kind] || 'Holding'}</span>${x.familyHeld ? chip('est', 'Family') : ''}${own && people.length > 1 ? chip('', own.name) : ''}${stale(x) ? chip('warn', 'Price old') : ''}</div></div>
      <div style="text-align:right"><b style="font-size:19px">${inrC(v)}</b>${g != null ? h`<div class="fx-sub ${g >= 0 ? 'ok' : 'bad'}" style="font-weight:700">${g >= 0 ? '+' : '−'}${inrC(Math.abs(g))} (${x.invested ? pp((g / x.invested) * 100, 1) : ''})</div>` : ''}</div></div>
      <div class="fx-row fx-between fx-sub" style="margin-top:10px"><span>${s ? `SIP ${inrF(s)}/mo` : (x.sips || []).length ? (paused ? 'SIP paused' : 'SIP stopped') : 'No SIP'}</span><span>${x.units ? `${x.units} units × ₹${x.price ?? '—'}` : x.invested != null ? `Invested ${inrC(x.invested)}` : ''}</span></div></button>`;
  };
  html(root, h`<div class="fx">${head({ kicker: 'INPUTS · ASSETS', title: 'Assets & Investments', back: '#/fire/inputs', right: h`<a class="fx-ib" href="#/fire/prices">Update prices</a>` })}
    <div class="fx-card"><div class="fx-lbl">TOTAL INVESTED ASSETS</div><div class="fx-big" style="font-size:clamp(28px,9vw,38px);margin:4px 0">${inr(totalV)}</div>
      <div class="fx-row" style="gap:14px;flex-wrap:wrap"><span class="fx-sub">SIPs <b style="color:var(--text)">${inrC(sips)}/mo</b></span>${gain != null ? h`<span class="fx-sub">Gain <b class="${gain >= 0 ? 'ok' : 'bad'}">${gain >= 0 ? '+' : '−'}${inrC(Math.abs(gain))}</b></span>` : ''}${D.hasDuet() ? '' : ''}</div>
      ${classes.length ? h`<div class="fx-bar thick" style="display:flex;gap:2px;background:none;margin-top:14px">${classes.map(([c, v]) => h`<i style="width:${(v / totalV) * 100}%;background:${clsColor(c)};border-radius:4px;min-width:3px"></i>`)}</div><div class="fx-legend" style="margin-top:10px">${classes.map(([c, v]) => h`<span><i style="background:${clsColor(c)}"></i>${clsLabel(c)} ${Math.round((v / totalV) * 100)}%</span>`)}</div>` : ''}</div>
    <div class="fx-chips" style="overflow-x:auto;flex-wrap:nowrap">${chips.map(([k, l]) => h`<button class="fx-opt ${filter === k ? 'on' : ''}" data-act="flt" data-k="${k}" style="white-space:nowrap">${l}</button>`)}</div>
    ${list.map(card)}${!list.length ? h`<div class="fx-note"><span>📭</span><div>${hs.length ? 'Nothing in this filter.' : 'Add your first holding: stocks, a mutual fund, EPF, NPS, cash or anything you own.'}</div></div>` : ''}
    <button class="fx-add" data-act="hadd">${IC.plus}<span>Add holding</span></button>
    ${hs.some((x) => x.familyHeld) ? note('ⓘ', `Family-held funds are ${X.getPlan().assumptions.includeFamilyFunds ? 'counted' : 'not counted'} in your plan. Change this in Assumptions → Growth & other or by editing the holding.`) : ''}${fxNav('inputs')}</div>`);
  bind(root, { click: { flt: (el) => { filter = el.dataset.k; X.redraw(); }, hd: (el) => holdingMenu(el.dataset.id), hadd: () => holdingSheet() } });
}

// ------------------------------------------------------------------------------------------ one holding
function holdingMenu(id) {
  const x = X.getPlan().holdings.find((q) => q.id === id); if (!x) return;
  const v = holdingValue(x), g = x.invested ? v - x.invested : null, c = clsOf(x);
  const s = sheet(h`<div class="fx-sheet-h"><div><h1>${x.name}</h1><div class="fx-sub">${HOLDING_KINDS[x.kind]} · ${clsLabel(c)}${x.priceAsOf ? ` · price ${ago(x.priceAsOf)}` : ''}</div></div><button class="iconbtn" data-act="close" aria-label="Close">${IC.close}</button></div>
    <div class="fx-grid2">${tile('CURRENT VALUE', inrF(v))}${tile('INVESTED', x.invested != null ? inrF(x.invested) : '—', g != null ? `${g >= 0 ? '+' : '−'}${inrC(Math.abs(g))} · ${pp((g / x.invested) * 100)}` : 'Not set')}</div>
    <div class="fx-list">
      <button class="fx-li" data-act="m_edit"><span class="grow"><b>Edit details</b><div class="fx-sub">Name, tags, class mix, owner, value</div></span>${IC.chev}</button>
      <button class="fx-li" data-act="m_sip"><span class="grow"><b>SIPs</b><div class="fx-sub">${(x.sips || []).length ? `${(x.sips || []).length} · ${inrF(sipTotal(x))}/mo active` : 'None yet. Add a monthly SIP.'}</div></span>${IC.chev}</button>
      <button class="fx-li" data-act="m_del"><span class="grow"><b class="bad">Delete holding</b><div class="fx-sub">Removes it from the plan. You can undo for a few seconds.</div></span></button>
      <button class="fx-li" data-act="m_buy"><span class="grow"><b>Record a purchase or withdrawal</b><div class="fx-sub">Adjusts value and amount invested</div></span>${IC.chev}</button>
      ${x.units != null ? h`<button class="fx-li" data-act="m_px"><span class="grow"><b>Update price</b><div class="fx-sub">${x.price != null ? `₹${x.price} per unit` : 'No price set'}</div></span>${IC.chev}</button>` : ''}
    </div><div class="fx-row"><button class="fx-btn ghost" data-act="close" style="flex:1">Close</button></div>`, { click: {
    m_edit: () => { s.close(); holdingSheet(id); }, m_sip: () => { s.close(); sipList(id); }, m_buy: () => { s.close(); flowSheet(id); },
    m_px: () => { s.close(); priceSheet(id); },
    m_del: async () => { s.close(); if (await confirmSheet(`Delete ${x.name}?`, 'It is removed from your plan. You can undo this for a few seconds.', 'Delete')) { FS.edit('holdings', (l) => l.filter((q) => q.id !== id), { immediate: true }); undoToast('Holding removed', () => FS.undo()); } },
  } });
}

export function holdingSheet(id) {
  const plan = X.getPlan(), x = id ? plan.holdings.find((q) => q.id === id) : null, people = plan.profile.people;
  const wallets = D.hasDuet() ? D.duetWallets() : [], invs = D.hasDuet() ? D.duetInvestments() : [];
  const c0 = x ? clsOf(x) : 'equity', mixed = c0 === 'mixed', mixOf = (cls) => (x?.mix || []).find((q) => q.cls === cls)?.pct ?? 0;
  const byUnits = x ? x.units != null : false;
  openForm({ title: x ? `Edit ${x.name}` : 'Add holding', values: { name: x?.name || '', kind: x?.kind || 'mf', assetClass: c0, owner: x?.owner || people[0].id, entry: byUnits ? 'units' : 'value', value: x?.value ?? null, units: x?.units ?? null, price: x?.price ?? null, invested: x?.invested ?? null,
      mEquity: mixOf('equity'), mHybrid: mixOf('hybrid'), mDebt: mixOf('debt'), mCash: mixOf('cash'), mGold: mixOf('gold'), subtype: x?.subtype || '', tags: x?.tags || [], returnPct: x?.returnPct ?? null, familyHeld: !!x?.familyHeld, include: x?.include !== false, link: x?.linkedWalletId != null ? 'w' + x.linkedWalletId : x?.linkedInvestmentId != null ? 'i' + x.linkedInvestmentId : '', notes: x?.notes || '' },
    fields: [{ name: 'name', label: 'Name', type: 'text', required: true, maxlength: 50, placeholder: 'e.g. HDFC Nifty 50 Index Fund' },
      { name: 'kind', label: 'What is it', type: 'select', options: Object.entries(HOLDING_KINDS) },
      { name: 'assetClass', label: 'Tag as', type: 'chips', options: [...CLASSES.map((c) => [c, CLASS_INFO[c].label]), ['mixed', 'Mixed']], help: 'Decides the expected return and risk used in the plan' },
      { type: 'note', text: 'Mixed: split by percentage. Must add up to 100.', show: (v) => v.assetClass === 'mixed' },
      { type: 'row', show: (v) => v.assetClass === 'mixed', fields: [{ name: 'mEquity', label: 'Equity %', type: 'pct', min: 0, max: 100 }, { name: 'mHybrid', label: 'Hybrid %', type: 'pct', min: 0, max: 100 }] },
      { type: 'row', show: (v) => v.assetClass === 'mixed', fields: [{ name: 'mDebt', label: 'Debt %', type: 'pct', min: 0, max: 100 }, { name: 'mCash', label: 'Cash %', type: 'pct', min: 0, max: 100 }] },
      { name: 'mGold', label: 'Gold %', type: 'pct', min: 0, max: 100, show: (v) => v.assetClass === 'mixed' },
      { name: 'subtype', label: 'Category (optional)', type: 'select', options: [['', 'None'], ...SUBTYPES.map((s) => [s, s])] },
      { name: 'entry', label: 'Value from', type: 'chips', options: [['value', 'Current value'], ['units', 'Units × price']] },
      { name: 'value', label: 'Current value', type: 'money', required: true, min: 0, show: (v) => v.entry === 'value' },
      { type: 'row', show: (v) => v.entry === 'units', fields: [{ name: 'units', label: 'Units', type: 'num', required: true, min: 0 }, { name: 'price', label: 'Price per unit', type: 'money', required: true, min: 0 }] },
      { name: 'invested', label: 'Amount invested (optional)', type: 'money', min: 0, help: 'Used for gain and tax only' },
      { name: 'owner', label: 'Owner', type: 'select', options: people.map((p) => [p.id, p.name]) },
      { name: 'returnPct', label: 'Override expected return (optional)', type: 'pct', min: -10, max: 40, help: 'Empty = use the class return from Assumptions' },
      ...(wallets.length || invs.length ? [{ name: 'link', label: 'Follow a Duet value', type: 'select', options: [['', 'No link'], ...wallets.map((w) => ['w' + w.id, `Wallet · ${w.name}`]), ...invs.map((i) => ['i' + i.id, `Portfolio · ${i.symbol}`])], help: 'The value can then be refreshed from Duet in one tap' }] : []),
      { name: 'familyHeld', type: 'toggle', hint: 'Held by family (e.g. parent\'s fund)' }, { name: 'include', type: 'toggle', hint: 'Include in the plan' },
      { name: 'notes', label: 'Notes', type: 'textarea' }],
    validate: (v) => (v.assetClass === 'mixed' && Math.round((v.mEquity || 0) + (v.mHybrid || 0) + (v.mDebt || 0) + (v.mCash || 0) + (v.mGold || 0)) !== 100 ? 'The mix must add up to 100%' : ''),
    onDelete: x ? () => { FS.edit('holdings', (l) => l.filter((q) => q.id !== id), { immediate: true }); undoToast('Holding removed', () => FS.undo()); } : null,
    onSave: (v) => {
      const row = { ...(x || { id: uid('h'), sips: [] }), name: v.name, kind: v.kind, owner: v.owner, subtype: v.subtype || null, invested: v.invested, returnPct: v.returnPct, familyHeld: v.familyHeld, include: v.include, notes: v.notes || '' };
      if (v.assetClass === 'mixed') { row.mix = [['equity', v.mEquity], ['hybrid', v.mHybrid], ['debt', v.mDebt], ['cash', v.mCash], ['gold', v.mGold]].filter(([, p]) => p > 0).map(([cls, pct]) => ({ cls, pct })); row.assetClass = row.mix[0].cls; }
      else { row.assetClass = v.assetClass; delete row.mix; }
      if (v.entry === 'units') { row.units = v.units; row.price = v.price; row.priceAsOf = x?.price === v.price ? x.priceAsOf : X.today(); row.value = Math.round(v.units * v.price); } else { row.value = v.value; delete row.units; if (x?.units != null) { delete row.price; delete row.priceAsOf; } }
      delete row.linkedWalletId; delete row.linkedInvestmentId; if (v.link?.startsWith('w')) row.linkedWalletId = Number(v.link.slice(1)); else if (v.link?.startsWith('i')) row.linkedInvestmentId = Number(v.link.slice(1));
      row.source = row.linkedWalletId != null || row.linkedInvestmentId != null ? 'duet' : 'entered';
      FS.edit('holdings', (l) => (x ? l.map((q) => (q.id === id ? row : q)) : [...l, row]), { immediate: true });
    } });
}

function priceSheet(id) {
  const x = X.getPlan().holdings.find((q) => q.id === id);
  openForm({ title: `Update price · ${x.name}`, values: { price: x.price ?? null }, fields: [{ name: 'price', label: 'Current price per unit', type: 'money', required: true, min: 0, help: `${x.units} units held` }],
    onSave: (v) => FS.edit('holdings', (l) => l.map((q) => (q.id === id ? { ...q, price: v.price, priceAsOf: X.today(), value: Math.round((Number(q.units) || 0) * v.price) } : q)), { immediate: true }) });
}

function flowSheet(id) {
  const x = X.getPlan().holdings.find((q) => q.id === id);
  openForm({ title: `Purchase or withdrawal · ${x.name}`, sub: 'Records money moving in or out of this holding', values: { dir: 'buy', amount: null, units: null },
    fields: [{ name: 'dir', label: 'What happened', type: 'chips', options: [['buy', 'Bought / added'], ['sell', 'Sold / withdrew']] }, { name: 'amount', label: 'Amount', type: 'money', required: true, min: 1 }, ...(x.units != null ? [{ name: 'units', label: 'Units (optional)', type: 'num', min: 0, help: 'If empty, units are worked out from the price' }] : [])],
    validate: (v) => (v.dir === 'sell' && v.amount > holdingValue(x) ? 'That is more than the current value' : ''),
    onSave: (v) => FS.edit('holdings', (l) => l.map((q) => {
      if (q.id !== id) return q;
      const cur = holdingValue(q), up = v.dir === 'buy', u = v.units ?? (q.price ? v.amount / q.price : null), out = { ...q };
      out.invested = up ? (Number(q.invested) || 0) + v.amount : Math.max(0, (Number(q.invested) || 0) * (1 - Math.min(1, v.amount / (cur || 1))));
      if (q.units != null && u != null) { out.units = +(Math.max(0, q.units + (up ? u : -u))).toFixed(4); out.value = Math.round(out.units * (q.price || 0)); } else out.value = Math.max(0, cur + (up ? v.amount : -v.amount));
      return out;
    }), { immediate: true }) });
}

// ------------------------------------------------------------------------------------------ SIPs
function sipList(id) {
  const draw = () => {
    const x = X.getPlan().holdings.find((q) => q.id === id), sips = x?.sips || [];
    return h`<div class="fx-sheet-h"><div><h1>SIPs · ${x.name}</h1><div class="fx-sub">${inrF(sipTotal(x))}/mo active</div></div><button class="iconbtn" data-act="close" aria-label="Close">${IC.close}</button></div>
      <div class="col" style="gap:10px">${sips.map((q) => h`<button class="fx-tile" data-act="sedit" data-id="${q.id}" style="text-align:left"><div class="fx-row fx-between"><b style="font-size:18px">${inrF(q.amount)}<span class="fx-sub"> / ${q.frequency === 'quarterly' ? 'quarter' : q.frequency === 'yearly' ? 'year' : 'month'}</span></b>${chip(q.status === 'paused' ? 'warn' : q.status === 'stopped' ? 'bad' : 'ok', q.status === 'paused' ? 'Paused' : q.status === 'stopped' ? 'Stopped' : 'Active')}</div>
        <div class="fx-sub" style="margin-top:6px">${q.start ? `From ${monthYear(q.start)}` : 'Started earlier'}${q.end ? ` · until ${monthYear(q.end)}` : ' · until retirement'}${q.followsIncome ? ' · grows with salary' : q.stepUpPct ? ` · +${q.stepUpPct}%/yr` : ''}${q.payroll ? ' · deducted from salary' : ''}</div></button>`)}${!sips.length ? h`<div class="fx-sub">No SIPs on this holding.</div>` : ''}</div>
      <button class="fx-add" data-act="sadd" style="padding:14px">${IC.plus}<span>Add SIP</span></button>
      <div class="fx-row"><button class="fx-btn ghost" data-act="close" style="flex:1">Done</button></div>`;
  };
  const s = sheet(draw(), { click: { sadd: () => { s.close(); sipSheet(id); }, sedit: (el) => { s.close(); sipSheet(id, el.dataset.id); } } });
}
function sipSheet(hid, sid) {
  const plan = X.getPlan(), x = plan.holdings.find((q) => q.id === hid), q = sid ? x.sips.find((z) => z.id === sid) : null;
  const done = () => sipList(hid);
  openForm({ title: q ? 'Edit SIP' : 'Add SIP', sub: x.name, values: { amount: q?.amount ?? null, frequency: q?.frequency || 'monthly', start: q?.start || '', end: q?.end || '', stepMode: q?.followsIncome ? 'income' : q?.stepUpPct ? 'pct' : 'none', stepUpPct: q?.stepUpPct ?? 8, payroll: !!q?.payroll, status: q?.status || 'active' },
    fields: [{ name: 'amount', label: 'Amount', type: 'money', required: true, min: 0 }, { name: 'frequency', label: 'How often', type: 'chips', options: [['monthly', 'Monthly'], ['quarterly', 'Quarterly'], ['yearly', 'Yearly']] },
      { type: 'row', fields: [{ name: 'start', label: 'Start month', type: 'month' }, { name: 'end', label: 'End month', type: 'month', help: 'Empty = until retirement' }] },
      { name: 'stepMode', label: 'Yearly step-up', type: 'chips', options: [['none', 'None'], ['pct', 'Fixed %'], ['income', 'With salary']] },
      { name: 'stepUpPct', label: 'Increase each year', type: 'pct', min: 0, max: 50, show: (v) => v.stepMode === 'pct' },
      { name: 'payroll', type: 'toggle', hint: 'Deducted from salary (EPF, NPS employer)', },
      { name: 'status', label: 'Status', type: 'chips', options: [['active', 'Active'], ['paused', 'Paused'], ['stopped', 'Stopped']] }],
    validate: (v) => (v.start && v.end && v.end < v.start ? 'End month is before the start month' : ''),
    onDelete: q ? () => { FS.edit('holdings', (l) => l.map((z) => (z.id === hid ? { ...z, sips: z.sips.filter((s) => s.id !== sid) } : z)), { immediate: true }); undoToast('SIP removed', () => FS.undo()); } : null,
    onSave: (v) => { const row = { ...(q || { id: uid('s') }), amount: v.amount, frequency: v.frequency, start: v.start || null, end: v.end || null, payroll: v.payroll, status: v.status, followsIncome: v.stepMode === 'income', stepUpPct: v.stepMode === 'pct' ? v.stepUpPct : 0 };
      FS.edit('holdings', (l) => l.map((z) => (z.id === hid ? { ...z, sips: q ? z.sips.map((s) => (s.id === sid ? row : s)) : [...(z.sips || []), row] } : z)), { immediate: true }); } });
  void done; void errToast; void toast; void birthYearOf; void srcChip; void pc;
}
