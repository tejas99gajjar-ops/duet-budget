// How complete is each input section? Drives the Inputs hub, the Overview banner and the "missing" filters.
import { inrC, inrF } from './format.js';
import { holdingValue, birthYearOf, loanProjection } from './engine.js';

const sum = (a) => a.reduce((s, x) => s + x, 0);
export const SECTION_META = [
  ['profile', 'Profile', '👤', '#8B6CF0'], ['income', 'Income', '💰', '#1DDB97'], ['spending', 'Spending', '🛒', '#F5A623'], ['assets', 'Assets & Investments', '📈', '#4C8DF6'],
  ['loans', 'Loans & EMIs', '🏠', '#F04444'], ['insurance', 'Insurance', '🛡️', '#8B6CF0'], ['events', 'Life Events', '🎯', '#E879A0'], ['assumptions', 'Assumptions', '⚙️', '#8B97B3'],
];

export function sectionHealth(plan, today = new Date().toISOString().slice(0, 10)) {
  const base = Number(today.slice(0, 4)); const people = plan.profile.people, p0 = people[0];
  const age = (p) => base - birthYearOf(p, base);
  const incomes = plan.incomes.filter((i) => i.include !== false), takeHome = sum(incomes.filter((i) => i.type !== 'passive').map((i) => Number(i.takeHome) || 0)), passive = sum(incomes.filter((i) => i.type === 'passive').map((i) => Number(i.takeHome) || 0));
  const holdings = plan.holdings.filter((h) => h.include !== false), pots = sum(holdings.map(holdingValue));
  const sips = sum(holdings.flatMap((h) => (h.sips || []).filter((s) => s.status !== 'paused' && s.status !== 'stopped').map((s) => Number(s.amount) || 0)));
  const loans = plan.loans.filter((l) => l.status !== 'closed'), lp = loans.map((l) => ({ l, p: loanProjection(l, today) }));
  const emi = sum(lp.map((x) => Number(x.l.currentPayment ?? x.p.emi) || 0)), out = sum(loans.map((l) => Number(l.outstanding ?? l.principal) || 0));
  const ins = plan.insurance, cover = sum(ins.map((i) => Number(i.cover) || 0)), prem = sum(ins.map((i) => Number(i.premium) * (i.frequency === 'monthly' ? 12 : 1) || 0));
  const cur = Number(plan.spending.currentMonthly) || sum((plan.spending.categories || []).map((c) => Number(c.monthly) || 0));
  const out2 = {};
  const set = (id, status, summary, msg = '') => { out2[id] = { id, status, summary, msg }; };

  const partnerMissing = people.slice(1).some((p) => p.dob == null && p.birthYear == null);
  set('profile', !p0 || (p0.dob == null && p0.birthYear == null) ? 'missing' : partnerMissing ? 'attn' : 'ok',
    `${people.map((p) => `${p.name || 'Person'} ${age(p)}`).join(', ')} · Retire at ${p0?.retireAge ?? 50}`, partnerMissing ? 'Add your partner\'s date of birth' : '');
  set('income', !incomes.length ? 'missing' : 'ok', incomes.length ? `${inrC(takeHome + passive)}/mo total${passive ? ` (incl. ${inrC(passive)} passive)` : ''} · ${plan.assumptions.salaryGrowth}% growth` : 'Add your take-home pay', incomes.length ? '' : 'No income added yet');
  set('spending', !cur ? 'missing' : 'ok', cur ? `${inrC(cur)}/mo now · ${inrC(plan.spending.retirement?.monthly ?? cur)}/mo at retirement` : 'Add what you spend each month', cur ? '' : 'No spending added yet');
  const stale = holdings.filter((h) => h.price != null && h.priceAsOf && (Date.now() - new Date(h.priceAsOf).getTime()) / 864e5 > 30);
  set('assets', !holdings.length ? 'missing' : stale.length ? 'attn' : 'ok', holdings.length ? `${inrC(pots)} across ${holdings.length} ${holdings.length === 1 ? 'holding' : 'holdings'} · ${inrC(sips)} SIP` : 'Add what you own', stale.length ? `${stale.length} price${stale.length > 1 ? 's' : ''} older than 30 days` : holdings.length ? '' : 'No holdings added yet');
  const loanIssue = lp.find((x) => !x.p.emi || !x.p.months || x.l.needsReview);
  set('loans', loanIssue ? 'attn' : 'ok', loans.length ? `${inrC(emi)}/mo EMI · ${inrC(out)} outstanding` : 'No loans', loanIssue ? `${loanIssue.l.name || 'A loan'}: ${x2(loanIssue)}` : '');
  function x2(x) { return !x.p.emi ? 'EMI or tenure not set' : 'end date may need an update'; }
  const noHealth = !ins.some((i) => i.kind === 'health'), toConfirm = ins.filter((i) => i.status === 'confirm');
  set('insurance', noHealth || toConfirm.length ? 'attn' : 'ok', ins.length ? `${inrC(cover)} total cover · ${inrC(prem)}/yr premium` : 'No policies added', noHealth ? 'No health insurance recorded' : `${toConfirm.length} to confirm`);
  const evMissing = plan.events.filter((e) => e.enabled !== false && ['baby', 'school', 'house', 'car', 'custom'].includes(e.kind) && !Number(e.cost) && !Number(e.annualCost));
  set('events', evMissing.length ? 'attn' : 'ok', `${plan.events.length} ${plan.events.length === 1 ? 'event' : 'events'} on your timeline`, evMissing.length ? `${evMissing[0].name || 'An event'}: cost not confirmed` : '');
  const A = plan.assumptions; set('assumptions', 'ok', `Inflation ${A.inflation.general}% · Equity ${A.returns.equity}% · SWR ${A.swr}%`);
  const list = SECTION_META.map(([id, label, icon, color]) => ({ ...out2[id], label, icon, color }));
  const done = list.filter((s) => s.status === 'ok').length;
  return { list, done, total: list.length, pct: done / list.length, needing: list.filter((s) => s.status !== 'ok') };
}

/** Plain-language reasons for the current status, most important first (rule-based, no AI). */
export function reasons(res, plan) {
  const out = [], g = res.gap, A = plan.assumptions;
  const income = res.meta.takeHome;
  if (res.meta.emiNow && income && res.meta.emiNow / income > 0.25) out.push({ icon: '🏦', text: `EMIs take ${Math.round((res.meta.emiNow / income) * 100)}% of your take-home today (${inrC(res.meta.emiNow)} a month), which limits how much you can invest.`, to: '#/fire/inputs/loans' });
  const loanEnd = res.model.loanInfo.filter((l) => l.endYM && l.endYM.y <= res.meta.retireYear).sort((a, b) => b.endYM.y - a.endYM.y)[0];
  if (loanEnd && loanEnd.redirect) out.push({ icon: '🔓', text: `${loanEnd.name} ends in ${loanEnd.end}. Its ${inrC(loanEnd.emi)} EMI is freed and added to your investing.`, to: '#/fire/inputs/loans' });
  const partner = plan.profile.people[1]; const stop = plan.events.find((e) => e.kind === 'work_stop' && e.enabled !== false);
  if (stop) out.push({ icon: '⏸️', text: `${stop.name || 'Income stops'} in ${String(stop.date).slice(0, 4)}, so household income drops.`, to: '#/fire/inputs/events' });
  if (!plan.insurance.some((i) => i.kind === 'health')) out.push({ icon: '🏥', text: 'No health insurance is recorded. A medical bill could cost lakhs and is not in the plan.', to: '#/fire/inputs/insurance' });
  const paused = plan.holdings.flatMap((h) => (h.sips || []).filter((s) => s.status === 'paused'));
  if (paused.length) out.push({ icon: '⏯️', text: `${paused.length} SIP${paused.length > 1 ? 's are' : ' is'} paused (${inrC(paused.reduce((s, x) => s + (Number(x.amount) || 0), 0))} a month not being invested).`, to: '#/fire/inputs/assets' });
  if (g.amount > 0 && g.pct < 1) out.unshift({ icon: '📉', text: `Your pots are projected to reach ${inrC(g.projected)} by ${res.meta.retireYear}, ${Math.round(g.pct * 100)}% of the ${inrC(g.target)} needed.`, to: '#/fire/detail/gap' });
  if (g.amount <= 0) out.unshift({ icon: '✅', text: `Your projected corpus of ${inrC(g.projected)} covers the ${inrC(g.target)} target with ${inrC(-g.amount)} to spare.`, to: '#/fire/detail/gap' });
  void A; void partner;
  return out.slice(0, 3);
}
export { inrF };
