// Screens: Inputs · Loans & EMIs, Insurance, Life events.
import { h, bind, IC, chip, tile, note, bar, head, fxNav, sheet, openForm, undoToast } from './ui.js';
import { html } from '../core.js';
import * as FS from './store.js';
import * as X from './ctx.js';
import { LOAN_TAGS, INSURANCE_KINDS, EVENT_KINDS, GROUPS, GROUP_LABEL, uid } from './defaults.js';
import { loanProjection, emiFor, runPlan, eventImpacts, birthYearOf } from './engine.js';
import { inrC, inrF, pp, monthYear, dmy } from './format.js';

const sum = (a) => a.reduce((s, x) => s + x, 0);
const money = (n) => inrF(n);
const ymNow = () => X.today().slice(0, 7);

// ------------------------------------------------------------------------------------------ Loans
export function loansScreen(root) {
  const plan = X.getPlan(), today = X.today(), loans = plan.loans, active = loans.filter((l) => l.status !== 'closed');
  const proj = new Map(loans.map((l) => [l.id, loanProjection(l, today)]));
  const emi = sum(active.filter((l) => l.status !== 'planned').map((l) => Number(l.currentPayment ?? proj.get(l.id).emi) || 0)), out = sum(active.filter((l) => l.status !== 'planned').map((l) => Number(l.outstanding ?? l.principal) || 0));
  const takeHome = X.run().meta.takeHome, share = takeHome ? emi / takeHome : 0;
  const card = (l) => {
    const p = proj.get(l.id), o = Number(l.status === 'planned' ? l.principal : l.outstanding ?? l.principal) || 0, done = l.principal ? Math.max(0, Math.min(1, 1 - o / l.principal)) : 0, now = Number(l.currentPayment ?? p.emi) || 0;
    return h`<button class="fx-card" data-act="ln" data-id="${l.id}" style="text-align:left;width:100%;${l.status === 'closed' ? 'opacity:.55' : ''}"><div class="fx-row fx-between" style="align-items:flex-start;gap:10px"><div class="grow" style="min-width:0"><b style="font-size:19px">${l.name}</b><div class="fx-row" style="gap:6px;margin-top:6px;flex-wrap:wrap">${chip('', l.tag || 'Loan')}${l.status === 'planned' ? chip('est', 'Planned') : l.status === 'closed' ? chip('', 'Closed') : p.moratoriumMonths ? chip('warn', 'Moratorium') : ''}${l.needsReview ? chip('warn', 'Check dates') : ''}${l.rateType === 'floating' ? chip('', 'Floating') : ''}</div></div>
      <div style="text-align:right"><b style="font-size:19px">${inrC(o)}</b><div class="fx-sub">${l.ratePct || 0}% p.a.</div></div></div>
      <div style="margin-top:12px">${bar(done, 'var(--fx-ok)')}</div>
      <div class="fx-row fx-between fx-sub" style="margin-top:8px"><span>${now ? `${money(now)}/mo${p.moratoriumMonths ? ' now' : ''}` : 'EMI not set'}${p.moratoriumMonths && p.emi ? ` → ${money(p.emi)} later` : ''}</span><span>${p.months ? `Ends ${monthYear(p.end)}` : l.status === 'closed' ? '' : 'No end date'}</span></div></button>`;
  };
  html(root, h`<div class="fx">${head({ kicker: 'INPUTS · LOANS', title: 'Loans & EMIs', back: '#/fire/inputs' })}
    <div class="fx-card"><div class="fx-grid2"><div><div class="fx-lbl">MONTHLY EMI</div><div class="fx-big" style="font-size:clamp(24px,7.5vw,32px);margin-top:4px">${money(emi)}</div><div class="fx-sub">${takeHome ? `${Math.round(share * 100)}% of take-home` : ''}</div></div><div><div class="fx-lbl">OUTSTANDING</div><div class="fx-big" style="font-size:clamp(24px,7.5vw,32px);margin-top:4px">${inrC(out)}</div><div class="fx-sub">${active.length} active loan${active.length === 1 ? '' : 's'}</div></div></div>
      ${share > 0.4 ? h`<div class="fx-note warn" style="margin-top:12px"><span>⚠</span><div>EMIs above 40% of take-home leave little room for investing.</div></div>` : ''}</div>
    ${loans.map(card)}${!loans.length ? h`<div class="fx-note"><span>🎉</span><div>No loans recorded. Add one if you owe money, even a planned one.</div></div>` : ''}
    <button class="fx-add" data-act="ladd">${IC.plus}<span>Add loan</span></button>${fxNav('inputs')}</div>`);
  bind(root, { click: { ln: (el) => loanMenu(el.dataset.id), ladd: () => loanSheet() } });
}

function loanMenu(id) {
  const l = X.getPlan().loans.find((x) => x.id === id); if (!l) return; const p = loanProjection(l, X.today());
  const s = sheet(h`<div class="fx-sheet-h"><div><h1>${l.name}</h1><div class="fx-sub">${l.tag || 'Loan'}${l.lender ? ` · ${l.lender}` : ''}</div></div><button class="iconbtn" data-act="close" aria-label="Close">${IC.close}</button></div>
    <div class="fx-grid2">${tile('EMI AFTER MORATORIUM', p.emi ? money(p.emi) : '—', p.moratoriumMonths ? `${p.moratoriumMonths} months of interest-only first` : '')}${tile('TOTAL INTEREST LEFT', inrC(p.interest), p.months ? `Ends ${monthYear(p.end)}` : '')}</div>
    <div class="fx-list"><button class="fx-li" data-act="a_edit"><span class="grow"><b>Edit loan</b></span>${IC.chev}</button><button class="fx-li" data-act="a_ten"><span class="grow"><b>Compare tenures</b><div class="fx-sub">EMI, interest and end date for different lengths</div></span>${IC.chev}</button><button class="fx-li" data-act="a_pre"><span class="grow"><b>Prepayment what-if</b><div class="fx-sub">${l.prepay?.amount ? `Prepaying ${money(l.prepay.amount)} (${l.prepay.frequency})` : 'See interest saved and the effect on your FIRE gap'}</div></span>${IC.chev}</button></div>
    <div class="fx-row"><button class="fx-btn ghost" data-act="close" style="flex:1">Close</button></div>`, { click: { a_edit: () => { s.close(); loanSheet(id); }, a_ten: () => { s.close(); tenureSheet(id); }, a_pre: () => { s.close(); prepaySheet(id); } } });
}

export function loanSheet(id) {
  const plan = X.getPlan(), l = id ? plan.loans.find((x) => x.id === id) : null, people = plan.profile.people;
  openForm({ title: l ? `Edit ${l.name}` : 'Add loan', values: { name: l?.name || '', tag: l?.tag || 'Home', lender: l?.lender || '', borrower: l?.borrower || people[0].id, status: l?.status || 'active', principal: l?.principal ?? null, outstanding: l?.outstanding ?? null, ratePct: l?.ratePct ?? null, rateType: l?.rateType || 'fixed', emi: l?.emi ?? null, currentPayment: l?.currentPayment ?? null, emiStart: l?.emiStart || '', startDate: l?.startDate || '', lengthBy: l?.endDate ? 'end' : l?.tenureMonths && !l?.emi ? 'tenure' : 'emi', endDate: l?.endDate || '', tenureYears: l?.tenureMonths ? +(l.tenureMonths / 12).toFixed(2) : null, redirectFreed: l?.redirectFreed !== false },
    fields: [{ name: 'name', label: 'Name', type: 'text', required: true, maxlength: 40 }, { name: 'tag', label: 'Type', type: 'chips', options: LOAN_TAGS.map((t) => [t, t]) }, { name: 'lender', label: 'Lender (optional)', type: 'text', maxlength: 40 },
      { type: 'row', fields: [{ name: 'borrower', label: 'Borrower', type: 'select', options: [...people.map((p) => [p.id, p.name]), ['joint', 'Joint']] }, { name: 'status', label: 'Status', type: 'select', options: [['active', 'Active'], ['planned', 'Planned (not taken yet)'], ['closed', 'Closed']] }] },
      { name: 'startDate', label: 'Loan starts', type: 'month', show: (v) => v.status === 'planned' },
      { type: 'row', fields: [{ name: 'principal', label: v0(l, 'Loan amount'), type: 'money', required: true, min: 0 }, { name: 'outstanding', label: 'Outstanding now', type: 'money', min: 0, show: (v) => v.status !== 'planned' }] },
      { type: 'row', fields: [{ name: 'ratePct', label: 'Interest rate', type: 'pct', required: true, min: 0, max: 40 }, { name: 'rateType', label: 'Rate type', type: 'select', options: [['fixed', 'Fixed'], ['floating', 'Floating']] }] },
      { name: 'lengthBy', label: 'I know the', type: 'chips', options: [['emi', 'EMI'], ['end', 'End month'], ['tenure', 'Tenure']] },
      { name: 'emi', label: 'EMI per month', type: 'money', min: 0, show: (v) => v.lengthBy === 'emi' },
      { name: 'endDate', label: 'Last EMI month', type: 'month', show: (v) => v.lengthBy === 'end', help: 'The EMI is worked out from this' },
      { name: 'tenureYears', label: 'Tenure', type: 'num', min: 0.5, max: 40, suffix: 'years', show: (v) => v.lengthBy === 'tenure' },
      { type: 'title', text: 'Moratorium (optional)' },
      { type: 'row', fields: [{ name: 'currentPayment', label: 'Paying now', type: 'money', min: 0, help: 'Interest-only or part payment' }, { name: 'emiStart', label: 'Full EMI starts', type: 'month' }] },
      { name: 'redirectFreed', type: 'toggle', hint: 'Invest the EMI once the loan ends' }],
    validate: (v) => (v.lengthBy === 'emi' && !v.emi && !v.emiStart && v.status !== 'closed' ? '' : ''),
    onDelete: l ? () => { FS.edit('loans', (a) => a.filter((x) => x.id !== id), { immediate: true }); undoToast('Loan removed', () => FS.undo()); } : null,
    onSave: (v) => { const row = { ...(l || { id: uid('l') }), name: v.name, tag: v.tag, lender: v.lender, borrower: v.borrower, status: v.status, principal: v.principal, outstanding: v.status === 'planned' ? null : v.outstanding ?? v.principal, ratePct: v.ratePct, rateType: v.rateType, currentPayment: v.currentPayment || null, emiStart: v.emiStart || null, startDate: v.startDate || null, redirectFreed: v.redirectFreed, needsReview: false };
      row.emi = v.lengthBy === 'emi' ? v.emi : null; row.endDate = v.lengthBy === 'end' ? v.endDate || null : null; row.tenureMonths = v.lengthBy === 'tenure' && v.tenureYears ? Math.round(v.tenureYears * 12) : null;
      FS.edit('loans', (a) => (l ? a.map((x) => (x.id === id ? row : x)) : [...a, row]), { immediate: true }); } });
}
const v0 = (l, d) => d;

function tenureSheet(id) {
  const l = X.getPlan().loans.find((x) => x.id === id), p0 = loanProjection(l, X.today()), bal = p0.balanceAtEmiStart || Number(l.outstanding ?? l.principal) || 0, today = X.today();
  const yrsList = [3, 5, 7, 10, 12, 15, 20].filter((y) => y * 12 >= 12);
  const rows = yrsList.map((y) => { const emi = emiFor(bal, Number(l.ratePct) || 0, y * 12), pj = loanProjection({ ...l, emi: Math.round(emi), endDate: null, tenureMonths: null, currentPayment: l.currentPayment }, today); return { y, emi, interest: pj.interest, end: pj.end }; });
  const cur = p0.months;
  sheet(h`<div class="fx-sheet-h"><div><h1>Compare tenures</h1><div class="fx-sub">${l.name} · ${inrC(bal)} at ${l.ratePct || 0}%</div></div><button class="iconbtn" data-act="close" aria-label="Close">${IC.close}</button></div>
    <div class="fx-table" style="display:block"><div class="fx-list">${rows.map((r) => h`<div class="fx-li" style="gap:10px"><b style="min-width:4.2ch">${r.y} yr</b><span class="grow"><b>${money(r.emi)}</b><span class="fx-sub"> /mo</span></span><span style="text-align:right"><div>${inrC(r.interest)} interest</div><div class="fx-sub">ends ${monthYear(r.end)}</div></span></div>`)}</div></div>
    <div class="fx-sub">${cur ? `Your current plan: ${money(p0.emi)}/mo for ${(cur / 12).toFixed(1)} years.` : 'Set an EMI or end month to see your current plan here.'} A shorter tenure raises the EMI but saves interest and frees cash earlier for investing.</div>
    <div class="fx-row"><button class="fx-btn ghost" data-act="close" style="flex:1">Close</button></div>`, {});
}

function prepaySheet(id) {
  const plan = X.getPlan(), l = plan.loans.find((x) => x.id === id), today = X.today(), base = loanProjection({ ...l, prepay: null }, today), baseGap = runPlan({ ...plan, loans: plan.loans.map((x) => (x.id === id ? { ...x, prepay: null } : x)) }, { today }).gap;
  const s0 = { amount: l.prepay?.amount || 0, frequency: l.prepay?.frequency || 'yearly' };
  openForm({ title: 'Prepayment what-if', sub: l.name, values: { amount: s0.amount || null, frequency: s0.frequency }, cta: 'Save prepayment',
    fields: [{ name: 'frequency', label: 'How often', type: 'chips', options: [['monthly', 'Every month'], ['yearly', 'Once a year']] }, { name: 'amount', label: 'Extra amount each time', type: 'money', min: 0, help: 'Clear it and save to remove the prepayment' }],
    preview: (v) => { const a = Number(v.amount) || 0; if (!a) return h`<div class="fx-sub">Enter an amount to see the effect.</div>`; const pj = loanProjection({ ...l, prepay: { amount: a, frequency: v.frequency, start: ymNow() } }, today), gap = runPlan({ ...plan, loans: plan.loans.map((x) => (x.id === id ? { ...x, prepay: { amount: a, frequency: v.frequency, start: ymNow() } } : x)) }, { today }).gap, d = gap.projected - baseGap.projected;
      return h`<div class="fx-note purple"><span>💡</span><div>Loan ends <b>${monthYear(pj.end)}</b> instead of ${monthYear(base.end)} (${Math.max(0, base.months - pj.months)} months sooner). Interest saved: <b class="ok">${inrC(Math.max(0, base.interest - pj.interest))}</b>. Effect on your corpus: <b class="${d >= 0 ? 'ok' : 'bad'}">${d >= 0 ? '+' : '−'}${inrC(Math.abs(d))}</b> (the money prepaid is not invested).</div></div>`; },
    onSave: (v) => FS.edit('loans', (a) => a.map((x) => (x.id === id ? { ...x, prepay: v.amount > 0 ? { amount: v.amount, frequency: v.frequency, start: ymNow() } : null } : x)), { immediate: true }) });
}

// ------------------------------------------------------------------------------------------ Insurance
export function insuranceScreen(root) {
  const plan = X.getPlan(), ins = plan.insurance, people = plan.profile.people, res = X.run();
  const cover = (k) => sum(ins.filter((i) => i.kind === k).map((i) => Number(i.cover) || 0)), prem = sum(ins.map((i) => (Number(i.premium) || 0) * (i.frequency === 'monthly' ? 12 : 1))), income = (res.meta.takeHome || 0) * 12;
  const term = cover('term'), need = income * 12, hasHealth = ins.some((i) => i.kind === 'health');
  const owner = (i) => people.find((p) => p.id === i.holder)?.name || '';
  const card = (i) => h`<button class="fx-card" data-act="ie" data-id="${i.id}" style="text-align:left;width:100%"><div class="fx-row fx-between" style="gap:10px;align-items:flex-start"><div class="grow" style="min-width:0"><b style="font-size:18px">${i.name}</b><div class="fx-row" style="gap:6px;margin-top:6px;flex-wrap:wrap">${chip('', INSURANCE_KINDS[i.kind] || 'Policy')}${owner(i) ? chip('', owner(i)) : ''}${i.status === 'confirm' ? chip('warn', 'To confirm') : ''}</div></div><div style="text-align:right"><b style="font-size:19px">${inrC(i.cover)}</b><div class="fx-sub">cover</div></div></div>
    <div class="fx-row fx-between fx-sub" style="margin-top:10px"><span>${money(i.premium)} / ${i.frequency === 'monthly' ? 'month' : 'year'}${i.insurer ? ` · ${i.insurer}` : ''}</span><span>${i.premiumEndDate ? `Pay till ${monthYear(i.premiumEndDate)}` : i.coverTillAge ? `Cover till ${i.coverTillAge}` : ''}</span></div></button>`;
  html(root, h`<div class="fx">${head({ kicker: 'INPUTS · INSURANCE', title: 'Insurance', back: '#/fire/inputs' })}
    <div class="fx-card"><div class="fx-grid2"><div><div class="fx-lbl">TOTAL COVER</div><div class="fx-big" style="font-size:clamp(24px,7.5vw,32px);margin-top:4px">${inrC(sum(ins.map((i) => Number(i.cover) || 0)))}</div></div><div><div class="fx-lbl">PREMIUMS / YEAR</div><div class="fx-big" style="font-size:clamp(24px,7.5vw,32px);margin-top:4px">${inrC(prem)}</div></div></div></div>
    ${!hasHealth ? note('🏥', 'No health insurance recorded. A hospital stay could cost lakhs and is not covered in the plan.', 'warn') : ''}
    ${income && term < need ? note('🛡️', `Term cover of ${inrC(term)} is below a common guide of 10–12× yearly income (${inrC(need)}).`, 'warn') : income && term ? note('✅', `Term cover of ${inrC(term)} is above the 12× income guide.`, 'good') : ''}
    ${ins.map(card)}${!ins.length ? h`<div class="fx-note"><span>📭</span><div>Add term, health or other policies. Premiums are counted in the plan.</div></div>` : ''}
    <button class="fx-add" data-act="iadd">${IC.plus}<span>Add policy</span></button>${fxNav('inputs')}</div>`);
  bind(root, { click: { ie: (el) => insSheet(el.dataset.id), iadd: () => insSheet() } });
}
function insSheet(id) {
  const plan = X.getPlan(), i = id ? plan.insurance.find((x) => x.id === id) : null, people = plan.profile.people;
  openForm({ title: i ? `Edit ${i.name}` : 'Add policy', values: { name: i?.name || '', kind: i?.kind || 'term', holder: i?.holder || people[0].id, insurer: i?.insurer || '', cover: i?.cover ?? null, premium: i?.premium ?? null, frequency: i?.frequency || 'yearly', coverTillAge: i?.coverTillAge ?? null, premiumEndDate: i?.premiumEndDate || '', maturityDate: i?.maturityDate || '', status: i?.status || 'confirmed' },
    fields: [{ name: 'name', label: 'Policy name', type: 'text', required: true, maxlength: 50 }, { name: 'kind', label: 'Type', type: 'chips', options: Object.entries(INSURANCE_KINDS) }, { type: 'row', fields: [{ name: 'holder', label: 'Insured', type: 'select', options: people.map((p) => [p.id, p.name]) }, { name: 'insurer', label: 'Insurer', type: 'text', maxlength: 40 }] },
      { name: 'cover', label: 'Sum assured / cover', type: 'money', required: true, min: 0 }, { type: 'row', fields: [{ name: 'premium', label: 'Premium', type: 'money', required: true, min: 0 }, { name: 'frequency', label: 'Paid', type: 'select', options: [['yearly', 'Yearly'], ['monthly', 'Monthly']] }] },
      { type: 'row', fields: [{ name: 'premiumEndDate', label: 'Last premium', type: 'month' }, { name: 'coverTillAge', label: 'Cover till age', type: 'num', min: 30, max: 100 }] },
      { name: 'maturityDate', label: 'Matures (optional)', type: 'month', show: (v) => v.kind === 'ulip' }, { name: 'status', label: 'Details', type: 'chips', options: [['confirmed', 'Confirmed'], ['confirm', 'Need to confirm']] }],
    onDelete: i ? () => { FS.edit('insurance', (a) => a.filter((x) => x.id !== id), { immediate: true }); undoToast('Policy removed', () => FS.undo()); } : null,
    onSave: (v) => { const row = { ...(i || { id: uid('n') }), ...v, premiumEndDate: v.premiumEndDate || null, maturityDate: v.maturityDate || null }; FS.edit('insurance', (a) => (i ? a.map((x) => (x.id === id ? row : x)) : [...a, row]), { immediate: true }); } });
}

// ------------------------------------------------------------------------------------------ Life events
export function eventsScreen(root) {
  const plan = X.getPlan(), ev = [...plan.events].sort((a, b) => String(a.date || '9999').localeCompare(String(b.date || '9999'))), today = X.today();
  const imp = new Map(eventImpacts(plan, { today }).map((x) => [x.id, x.impact]));
  const cost = (e) => (Number(e.cost) ? money(e.cost) : Number(e.annualCost) ? `${money(e.annualCost)}/yr${e.durationYears ? ` × ${e.durationYears}` : ''}` : e.kind === 'work_stop' || e.kind === 'work_start' ? '' : 'Cost not set');
  const card = (e) => { const k = EVENT_KINDS[e.kind] || EVENT_KINDS.custom, d = imp.get(e.id), miss = !Number(e.cost) && !Number(e.annualCost) && !['work_stop', 'work_start', 'job'].includes(e.kind);
    return h`<div class="fx-card" style="${e.enabled === false ? 'opacity:.55' : ''}"><div class="fx-row" style="gap:12px;align-items:flex-start"><span class="fx-ico lg" style="background:var(--fx-tile);font-size:24px">${k.icon}</span><button class="grow" data-act="ee" data-id="${e.id}" style="text-align:left;min-width:0"><b style="font-size:18px">${e.name || k.label}</b><div class="fx-sub">${e.date ? monthYear(e.date) : 'No date'} · ${k.label}</div><div class="${miss ? 'warn' : ''}" style="margin-top:6px;font-weight:700">${cost(e)}</div>${d != null && Math.abs(d) > 1 && e.enabled !== false ? h`<div class="fx-sub" style="margin-top:2px">Corpus impact <b class="${d < 0 ? 'bad' : 'ok'}">${d < 0 ? '−' : '+'}${inrC(Math.abs(d))}</b></div>` : ''}</button>
      <button class="fx-toggle ${e.enabled !== false ? 'on' : ''}" role="switch" aria-checked="${e.enabled !== false}" aria-label="Include ${e.name}" data-act="etog" data-id="${e.id}"></button></div></div>`; };
  html(root, h`<div class="fx">${head({ kicker: 'INPUTS · LIFE EVENTS', title: 'Life Events', back: '#/fire/inputs' })}
    ${note('ⓘ', 'Events change spending, income or costs on a date. Switch one off to see what the plan looks like without it.', 'purple')}
    ${ev.map(card)}${!ev.length ? h`<div class="fx-note"><span>📭</span><div>No events yet. Add a baby, school fees, a house, a job change or anything that will change your money.</div></div>` : ''}
    <button class="fx-add" data-act="eadd">${IC.plus}<span>Add event</span></button>${fxNav('inputs')}</div>`);
  bind(root, { click: { ee: (el) => eventSheet(el.dataset.id), eadd: () => eventSheet(), etog: (el) => FS.edit('events', (a) => a.map((x) => (x.id === el.dataset.id ? { ...x, enabled: x.enabled === false } : x)), { immediate: true }) } });
}
export function eventSheet(id) {
  const plan = X.getPlan(), e = id ? plan.events.find((x) => x.id === id) : null, goals = plan.goals.filter((g) => g.kind !== 'retirement' && !g.archived), incomes = plan.incomes;
  const stopK = (k) => k === 'work_stop' || k === 'work_start';
  openForm({ title: e ? `Edit ${e.name}` : 'Add event', values: { kind: e?.kind || 'custom', name: e?.name || '', date: e?.date || '', cost: e?.cost ?? null, annualCost: e?.annualCost ?? null, durationYears: e?.durationYears ?? null, inflationGroup: e?.inflationGroup || '', incomeId: e?.incomeId || incomes[0]?.id || '', goalId: e?.goalId || '', enabled: e?.enabled !== false },
    fields: [{ name: 'kind', label: 'Type', type: 'select', options: Object.entries(EVENT_KINDS).map(([k, v]) => [k, `${v.icon} ${v.label}`]) }, { name: 'name', label: 'Name', type: 'text', required: true, maxlength: 40 }, { name: 'date', label: 'When', type: 'month', required: true },
      { name: 'incomeId', label: 'Which income', type: 'select', options: incomes.map((i) => [i.id, i.label]), show: (v) => stopK(v.kind) },
      { name: 'cost', label: 'One-time cost (today\'s money)', type: 'money', min: 0, show: (v) => !stopK(v.kind) }, { type: 'row', show: (v) => !stopK(v.kind), fields: [{ name: 'annualCost', label: 'Yearly cost', type: 'money', min: 0 }, { name: 'durationYears', label: 'For years', type: 'num', min: 1, max: 40 }] },
      { name: 'inflationGroup', label: 'Cost grows like', type: 'select', options: [['', 'Automatic'], ...GROUPS.map((g) => [g, GROUP_LABEL[g]])], show: (v) => !stopK(v.kind) },
      ...(goals.length ? [{ name: 'goalId', label: 'Paid from goal', type: 'select', options: [['', 'No goal (paid from monthly cash flow)'], ...goals.map((g) => [g.id, `${g.icon || ''} ${g.name}`])], show: (v) => !stopK(v.kind), help: 'A linked goal funds it, so it does not hit your cash flow twice' }] : []),
      { name: 'enabled', type: 'toggle', hint: 'Include in the plan' }],
    onDelete: e ? () => { FS.edit('events', (a) => a.filter((x) => x.id !== id), { immediate: true }); undoToast('Event removed', () => FS.undo()); } : null,
    onSave: (v) => { const row = { ...(e || { id: uid('e') }), kind: v.kind, name: v.name, date: v.date, enabled: v.enabled, inflationGroup: v.inflationGroup || undefined };
      if (stopK(v.kind)) { row.incomeId = v.incomeId; delete row.cost; delete row.annualCost; delete row.durationYears; delete row.goalId; } else { row.cost = v.cost; row.annualCost = v.annualCost; row.durationYears = v.durationYears; row.goalId = v.goalId || undefined; delete row.incomeId; }
      FS.edit('events', (a) => (e ? a.map((x) => (x.id === id ? row : x)) : [...a, row]), { immediate: true }); } });
}
export { dmy, pp, birthYearOf };
