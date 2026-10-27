// FIRE planner engine, method 1 (deterministic projection) and the shared model builder used by Monte Carlo.
// Pure functions: plan JSON in, numbers out. No network, no AI.
// Everything is in REAL terms (today's rupees) unless a field says "nominal"; real = nominal deflated by general inflation.
import { CLASSES, GROUPS, KIND_DEFAULT_CLASS, BUILTIN_SCENARIOS, normalizePlan } from './defaults.js';

const sum = (a) => a.reduce((s, x) => s + x, 0);
const ym = (s) => { if (!s) return null; const [y, m] = String(s).split('-').map(Number); return y ? { y, m: m || 1 } : null; };
const ymIdx = ({ y, m }) => y * 12 + (m - 1);
const fromIdx = (i) => ({ y: Math.floor(i / 12), m: (i % 12) + 1 });
const addM = (a, n) => fromIdx(ymIdx(a) + n);
export const ymStr = (a) => (a ? `${a.y}-${String(a.m).padStart(2, '0')}` : null);
export const birthYearOf = (p, baseYear) => (p.dob ? Number(String(p.dob).slice(0, 4)) : p.birthYear ?? baseYear - (p.age ?? 30));
export const holdingValue = (h) => Number(h.value ?? (Number(h.units) || 0) * (Number(h.price) || 0)) || 0;
export const STATUS = (pct) => (pct >= 1.2 ? 'ahead' : pct >= 1 ? 'on-track' : 'behind');

/** Built-in scenarios (a saved copy with the same id overrides the built-in), then your own. */
export const allScenarios = (plan) => { const own = plan.scenarios || [], ids = new Set(BUILTIN_SCENARIOS.map((b) => b.id)); return [...BUILTIN_SCENARIOS.map((b) => own.find((o) => o.id === b.id) || b), ...own.filter((o) => !ids.has(o.id))]; };
export const scenarioOf = (plan, id) => allScenarios(plan).find((s) => s.id === id) || BUILTIN_SCENARIOS.find((s) => s.id === 'base');

function effAssumptions(A, ov) {
  const e = JSON.parse(JSON.stringify(A));
  for (const g of Object.keys(e.inflation)) e.inflation[g] += ov.inflationDeltaPct || 0;
  for (const c of ['equity', 'hybrid', 'debt', 'nps', 'gold']) e.returns[c] += ov.returnDeltaPct || 0;
  e.returns.equity += ov.equityReturnDeltaPct || 0; e.returns.hybrid += (ov.equityReturnDeltaPct || 0) * 0.5; e.returns.nps += (ov.equityReturnDeltaPct || 0) * 0.5;
  e.newMoneyReturn += (ov.returnDeltaPct || 0) + (ov.equityReturnDeltaPct || 0) * 0.6;
  return e;
}

// ---------------------------------------------------------------- loans
export function nper(rateMonthly, payment, principal) {
  if (principal <= 0) return 0;
  if (rateMonthly <= 0) return payment > 0 ? principal / payment : Infinity;
  const x = 1 - (rateMonthly * principal) / payment;
  return x <= 0 ? Infinity : -Math.log(x) / Math.log(1 + rateMonthly);
}
export const emiFor = (principal, annualPct, months) => {
  if (months <= 0) return 0; const r = annualPct / 1200;
  return r === 0 ? principal / months : (principal * r) / (1 - Math.pow(1 + r, -months));
};
/**
 * Loan maths. Interest accrues during a moratorium (a smaller payment is made), then the EMI repays it.
 * An optional prepayment ({amount, frequency:'monthly'|'yearly', start}) shortens the loan.
 * Returns the month-by-month payments (flows) from the loan's start month.
 */
export function loanProjection(loan, today = new Date().toISOString().slice(0, 10)) {
  const t = ym(today); const planned = loan.status === 'planned' && ym(loan.startDate);
  const start = planned && ymIdx(planned) > ymIdx(t) ? planned : t;
  const r = (Number(loan.ratePct) || 0) / 1200;
  const principal = Number(planned ? loan.principal : loan.outstanding ?? loan.principal) || 0;
  const es = ym(loan.emiStart); const emiStart = es && ymIdx(es) > ymIdx(start) ? es : start;
  const m0 = ymIdx(emiStart) - ymIdx(start), pre = Number(loan.currentPayment ?? loan.emi ?? 0) || 0;
  let bal = principal; const flows = [];
  for (let k = 0; k < m0; k++) { bal = bal * (1 + r) - pre; flows.push(pre); }
  bal = Math.max(0, bal); const balanceAtEmiStart = bal;
  let emi = Number(loan.emi) || 0;
  if (loan.endDate && ym(loan.endDate)) { const n = Math.max(0, ymIdx(ym(loan.endDate)) - ymIdx(emiStart) + 1); if (!emi && n) emi = emiFor(bal, Number(loan.ratePct) || 0, n); }
  else if (Number(loan.tenureMonths) && !loan.emi) emi = emiFor(bal, Number(loan.ratePct) || 0, Number(loan.tenureMonths));
  const pp = loan.prepay && Number(loan.prepay.amount) > 0 ? loan.prepay : null, pstart = (pp && ym(pp.start)) || emiStart;
  let interest = 0, cur = emiStart, months = 0; const schedule = [];
  while (emi > 0 && bal > 0.5 && months < 600) {
    const i = bal * r; let pay = Math.min(emi, bal + i), extra = 0;
    if (pp && ymIdx(cur) >= ymIdx(pstart) && (pp.frequency !== 'yearly' || cur.m === pstart.m)) extra = Math.min(Number(pp.amount), Math.max(0, bal + i - pay));
    bal = bal + i - pay - extra; if (bal < 0) bal = 0; interest += i; flows.push(pay + extra); months++;
    if (cur.m === 12 || bal <= 0.5) schedule.push({ year: cur.y, balance: bal });
    cur = addM(cur, 1);
  }
  const endYM = months ? addM(emiStart, months - 1) : addM(emiStart, -1);
  return { startYM: start, emiStartYM: emiStart, balanceAtEmiStart, emi, months, end: ymStr(endYM), endYM, interest, moratoriumMonths: m0, currentPayment: pre, flows,
    totalPaid: flows.reduce((s, x) => s + x, 0), monthsLeft: m0 + months, schedule };
}

export function goalDate(g, plan, baseYear) {
  if (g.kind === 'retirement') return null;
  if (g.date) return ym(g.date);
  if (g.atAge) { const person = plan.profile.people.find((p) => p.id === g.person) || plan.profile.people[0]; return { y: birthYearOf(person, baseYear) + Number(g.atAge), m: 1 }; }
  return null;
}

// ---------------------------------------------------------------- model
/** Builds every input array once; the deterministic run and the Monte Carlo run both read it. */
export function buildModel(planIn, opts = {}) {
  const plan = normalizePlan(planIn);
  const today = opts.today || new Date().toISOString().slice(0, 10);
  const baseYear = Number(today.slice(0, 4)), baseMonth = Number(today.slice(5, 7));
  const f0 = (12 - (baseMonth - 1)) / 12;
  const sc = scenarioOf(plan, opts.scenarioId ?? plan.settings.activeScenarioId);
  const ov = { ...(sc?.overrides || {}), ...(opts.overrides || {}) };
  const A = effAssumptions(plan.assumptions, ov);
  const baseSalaryGrowth = plan.assumptions.salaryGrowth ?? 8;
  const people = plan.profile.people, primary = people[0];
  const birth = birthYearOf(primary, baseYear);
  const retireAge = Number(opts.retireAge ?? ov.retireAge ?? plan.settings.retireAge ?? primary.retireAge ?? 50);
  const retireYear = birth + retireAge;
  const horizonAge = plan.profile.horizonAge || 90, endYear = Math.max(birth + horizonAge, baseYear + 1);
  const nYears = endYear - baseYear;
  const infl = A.inflation.general / 100;
  const tmid = (y) => (y === baseYear ? f0 / 2 : f0 + (y - baseYear - 1) + 0.5);
  const frac = (y) => (y === baseYear ? f0 : 1);
  const lowBound = ymIdx({ y: baseYear, m: baseMonth });
  const monthsActive = (y, start, end) => {
    let lo = Math.max(y * 12, lowBound), hi = y * 12 + 11;
    if (start) lo = Math.max(lo, ymIdx(start)); if (end) hi = Math.min(hi, ymIdx(end));
    return Math.max(0, hi - lo + 1);
  };
  const realRate = (nominalPct) => (1 + nominalPct / 100) / (1 + infl) - 1;
  const rGroup = (g, y) => Math.pow((1 + (A.inflation[g] ?? A.inflation.general) / 100) / (1 + infl), y - baseYear);
  const zero = () => new Float64Array(nYears);
  const lastPre = retireYear - 1;
  const goals = plan.goals.filter((g) => !g.archived);
  const retGoal = goals.find((g) => g.kind === 'retirement') || { id: 'g_ret', kind: 'retirement', name: 'Retirement corpus' };
  const emergency = goals.find((g) => g.kind === 'emergency');
  const eventsOn = (e) => e.enabled !== false && !ov.eventsOff;

  // ---- income: before retirement it feeds household cash flow; after, any income still running offsets withdrawals
  const incomeReal = zero(), passiveReal = zero(), incomeMeta = [];
  const cashflowModeled = plan.incomes.length > 0 || !!ov.partnerWorks;   // with no income entered, contributions are assumed to be funded elsewhere
  const stopAt = {}, startAt = {};
  for (const e of plan.events) { if (!eventsOn(e) || !e.incomeId || !ym(e.date)) continue; if (e.kind === 'work_stop') stopAt[e.incomeId] = ym(e.date); if (e.kind === 'work_start') startAt[e.incomeId] = ym(e.date); }
  const incomes = plan.incomes.filter((i) => i.include !== false);
  if (ov.partnerWorks) incomes.push({ id: '__partner', person: people[1]?.id, label: 'Partner income (scenario)', takeHome: ov.partnerWorks.monthly, growthPct: ov.partnerWorks.growthPct ?? 6, startDate: `${ov.partnerWorks.startYear}-01`, untilYear: ov.partnerWorks.endYear ?? null, type: 'active' });
  for (const inc of incomes) {
    const owner = people.find((p) => p.id === inc.person) || primary;
    const passive = inc.type === 'passive' || !!inc.continuesPostRetirement;
    let until = inc.untilYear ?? null;
    if (until == null && !passive) until = owner === primary ? retireYear : owner.workEndYear ?? birthYearOf(owner, baseYear) + (owner.retireAge ?? retireAge);
    let end = until != null ? { y: until - 1, m: 12 } : null;
    const stop = stopAt[inc.id]; if (stop) { const e2 = addM(stop, -1); end = !end || ymIdx(e2) < ymIdx(end) ? e2 : end; }
    const start = startAt[inc.id] || ym(inc.startDate);
    const g = ((inc.growthPct ?? baseSalaryGrowth) + (inc.type === 'passive' ? 0 : ov.incomeGrowthDeltaPct || 0)) / 100;
    const monthly = Number(inc.takeHome ?? inc.monthly) || 0;
    incomeMeta.push({ id: inc.id, label: inc.label, monthly, until, passive });
    for (let i = 0; i < nYears; i++) {
      const y = baseYear + i, mths = monthsActive(y, start, end); if (!mths) continue;
      const v = (monthly * Math.pow(1 + g, y - baseYear) * mths) / Math.pow(1 + infl, tmid(y));
      if (y < retireYear) incomeReal[i] += v; else passiveReal[i] += v;
    }
  }

  // ---- current spending, real
  const catSum = sum((plan.spending.categories || []).map((c) => Number(c.monthly) || 0));
  const spendMonthly = Number(plan.spending.currentMonthly) || catSum;
  const ls = A.lifestyleInflation?.on ? A.lifestyleInflation.pct / 100 : 0;
  const spendReal = zero();
  for (let i = 0; i < nYears; i++) { const y = baseYear + i; if (y >= retireYear) break; spendReal[i] = (spendMonthly * 12 * frac(y) * Math.pow(1 + ls, y - baseYear)); }

  // ---- loans (nominal, fixed payments; deflated to real)
  const loanReal = zero(), freedReal = zero(), loanInfo = [];
  for (const loan of plan.loans) {
    if (loan.status === 'closed') continue;
    const lp = loanProjection(loan, today); const redirect = loan.redirectFreed !== false && A.redirectFreedEmi !== false;
    const nominalY = new Float64Array(nYears);
    lp.flows.forEach((amt, k) => { const at = addM(lp.startYM, k), i = at.y - baseYear; if (i >= 0 && i < nYears) nominalY[i] += amt; });
    for (let i = 0; i < nYears; i++) loanReal[i] += nominalY[i] / Math.pow(1 + infl, tmid(baseYear + i));
    loanInfo.push({ id: loan.id, name: loan.name, emi: lp.emi, end: lp.end, endYM: lp.endYM, months: lp.months, redirect });
    if (redirect && lp.months) for (let i = 0; i < nYears; i++) { const y = baseYear + i; if (y > lastPre) break; const mths = monthsActive(y, addM(lp.endYM, 1), { y: lastPre, m: 12 }); if (mths) freedReal[i] += (lp.emi * mths) / Math.pow(1 + infl, tmid(y)); }
  }

  // ---- insurance premiums (a ULIP premium is a contribution to the ULIP holding, never an outflow)
  const premReal = zero(), premPostReal = zero();
  for (const p of plan.insurance) {
    if (p.kind === 'ulip' || !Number(p.premium)) continue;
    const annual = Number(p.premium) * (p.frequency === 'monthly' ? 12 : 1);
    const owner = people.find((x) => x.id === p.holder) || primary;
    const lastYear = ym(p.premiumEndDate)?.y ?? (p.coverTillAge ? birthYearOf(owner, baseYear) + Number(p.coverTillAge) - 1 : p.kind === 'health' ? endYear - 1 : lastPre);
    for (let i = 0; i < nYears; i++) {
      const y = baseYear + i; if (y > lastYear) break;
      const v = (annual * frac(y) * (p.kind === 'health' ? rGroup('medical', y) : 1)) / Math.pow(1 + infl, tmid(y));
      if (y < retireYear) premReal[i] += v; else premPostReal[i] += v;
    }
  }

  // money regularly sent to dependants (e.g. parents), in today's rupees, until the given year (or for life). Counted with premiums: fixed commitments, never switched off with events
  for (const d of plan.profile.dependants || []) {
    const mo = Number(d.monthly) || 0, last = Number(d.untilYear) || endYear; if (!mo) continue;
    for (let i = 0; i < nYears; i++) { const y = baseYear + i; if (y > last) break; const v = mo * 12 * frac(y); if (y < retireYear) premReal[i] += v; else premPostReal[i] += v; }
  }

  // ---- cost events
  const evReal = zero(), evPostReal = zero();
  const COST_KINDS = ['baby', 'school', 'house', 'car', 'lifestyle', 'medical', 'custom', 'loan_start'];
  const costEvents = plan.events.filter((e) => eventsOn(e) && !e.goalId && COST_KINDS.includes(e.kind));
  const eventArrays = (e) => {
    const a = zero(), post = zero(), d = ym(e.date); if (!d) return { a, post };
    const grp = e.inflationGroup || (e.kind === 'school' ? 'education' : e.kind === 'medical' ? 'medical' : 'general');
    for (let i = 0; i < nYears; i++) {
      const y = baseYear + i; let c = 0; const dur = Number(e.durationYears) || 0;
      if (y === d.y) c += Number(e.cost) || 0;
      if (dur && y >= d.y && y < d.y + dur) c += Number(e.annualCost) || 0;
      if (c) (y < retireYear ? a : post)[i] += c * rGroup(grp, y);
    }
    return { a, post };
  };
  for (const e of costEvents) { const { a, post } = eventArrays(e); for (let i = 0; i < nYears; i++) { evReal[i] += a[i]; evPostReal[i] += post[i]; } }

  // ---- holdings and contributions
  const holdings = [];
  for (const h of plan.holdings) {
    if (h.include === false || (h.familyHeld && !A.includeFamilyFunds) || (h.kind === 'property' && !A.includeHouse)) continue;
    const mix = Array.isArray(h.mix) && h.mix.length ? h.mix : [{ cls: h.assetClass || KIND_DEFAULT_CLASS[h.kind] || 'equity', pct: 100 }];
    const tot = sum(mix.map((x) => Number(x.pct) || 0)) || 100;
    const comps = mix.map((x) => ({ cls: x.cls, w: (Number(x.pct) || 0) / tot }));
    const nomRet = h.returnPct != null && h.returnPct !== '' ? Number(h.returnPct) + (ov.returnDeltaPct || 0) : sum(comps.map((c) => c.w * A.returns[c.cls]));
    const owner = people.find((p) => p.id === h.owner) || primary;
    const contribReal = zero(), contribTake = zero();
    for (const s of h.sips || []) {
      if (s.status === 'paused' || s.status === 'stopped') continue;
      const start = ym(s.start), end = ym(s.end) || { y: lastPre, m: 12 };
      const stepPct = s.followsIncome ? (owner.growth ?? baseSalaryGrowth) + (ov.incomeGrowthDeltaPct || 0) : s.stepUpPct != null ? Number(s.stepUpPct) + (ov.incomeGrowthDeltaPct || 0) : 0;
      const per = (s.frequency === 'quarterly' ? 1 / 3 : s.frequency === 'yearly' ? 1 / 12 : 1) * (Number(s.amount) || 0) * (ov.sipFactor ?? 1);
      const s0 = Math.max(baseYear, start ? start.y : baseYear);
      for (let i = 0; i < nYears; i++) {
        const y = baseYear + i, mths = monthsActive(y, start, end); if (!mths) continue;
        const v = (per * Math.pow(1 + stepPct / 100, Math.max(0, y - s0)) * mths) / Math.pow(1 + infl, tmid(y));
        contribReal[i] += v; if (!s.payroll) contribTake[i] += v;
      }
    }
    const split = h.goalSplit && Object.keys(h.goalSplit).length ? { ...h.goalSplit } : emergency && comps.length === 1 && comps[0].cls === 'cash' ? { [emergency.id]: 100 } : {};
    const used = sum(Object.values(split).map(Number)); if (used < 100 && !split[retGoal.id]) split[retGoal.id] = 100 - used;
    holdings.push({ id: h.id, name: h.name, v0: holdingValue(h), comps, nomRet, rr: realRate(nomRet), contribReal, contribTake, cls: comps[0].cls,
      split: Object.fromEntries(Object.entries(split).map(([k, v]) => [k, Number(v) / 100])) });
  }
  const newRet = realRate(A.newMoneyReturn);
  const virtual = (id, name, contrib, cls, goalId) => holdings.push({ id, name, v0: 0, comps: [{ cls, w: 1 }], nomRet: A.newMoneyReturn, rr: newRet, contribReal: contrib, contribTake: contrib, cls, virtual: true, split: { [goalId]: 1 } });
  if (sum(freedReal)) virtual('__freed', 'EMI freed, invested', freedReal, 'equity', retGoal.id);
  if (ov.extraMonthly) {
    const c = zero(), st = (ov.extraStepUpPct ?? baseSalaryGrowth + (ov.incomeGrowthDeltaPct || 0)) / 100;
    for (let i = 0; i < nYears; i++) { const y = baseYear + i; if (y > lastPre) break; c[i] = (ov.extraMonthly * Math.pow(1 + st, y - baseYear) * 12 * frac(y)) / Math.pow(1 + infl, tmid(y)); }
    virtual('__extra', 'Extra monthly saving', c, 'equity', retGoal.id);
  }
  for (const g of goals) {
    if (!Number(g.monthlyAlloc)) continue;
    const gd = goalDate(g, plan, baseYear); const last = g.kind === 'retirement' ? lastPre : Math.min(endYear - 1, gd ? gd.y - 1 : lastPre);
    const c = zero(), st = (Number(g.stepUpPct) || 0) / 100;
    for (let i = 0; i < nYears; i++) { const y = baseYear + i; if (y > last) break; c[i] = (g.monthlyAlloc * Math.pow(1 + st, y - baseYear) * 12 * frac(y)) / Math.pow(1 + infl, tmid(y)); }
    virtual('__alloc_' + g.id, `${g.name} allocation`, c, 'hybrid', g.id);
  }
  const takeContrib = zero();
  for (const h of holdings) for (let i = 0; i < nYears; i++) takeContrib[i] += h.contribTake[i];

  // ---- retirement phase
  const nonEdu = (plan.spending.categories || []).filter((c) => c.group !== 'education');
  const curNonEdu = sum(nonEdu.map((c) => Number(c.monthly) || 0)) || spendMonthly;
  let retMonthly = ov.retireSpendMonthly ?? plan.spending.retirement?.monthly ?? curNonEdu;
  retMonthly = Math.max(0, retMonthly * (ov.retireSpendFactor ?? 1) - (ov.spendCutMonthly || 0));
  let shares = plan.spending.retirement?.shares;
  if (!shares) { const t = sum(nonEdu.map((c) => Number(c.monthly) || 0)); shares = t ? Object.fromEntries(GROUPS.map((g) => [g, sum(nonEdu.filter((c) => c.group === g).map((c) => Number(c.monthly) || 0)) / t])) : { general: 0.85, medical: 0.1, housing: 0.05, education: 0 }; }
  // housing choice in retirement: keep renting (default), own the house (only upkeep, 25% of rent), or a custom monthly amount
  const hs = plan.spending.housing;
  if (hs === 'own') shares = { ...shares, housing: (shares.housing || 0) * 0.25 };
  else if (hs === 'custom' && retMonthly > 0) shares = { ...shares, housing: Math.min(1, (Number(plan.spending.housingMonthly) || 0) / retMonthly) };
  const wTot = sum(Object.values(A.retirementAllocation)) || 100;
  const allocW = Object.fromEntries(Object.entries(A.retirementAllocation).map(([c, w]) => [c, w / wTot]));
  const retNom = sum(Object.entries(allocW).map(([c, w]) => w * A.returns[c]));
  const rRet = realRate(retNom);
  const grossUp = 1 + ((A.taxPct || 0) / 100) * ((A.gainSharePct || 0) / 100);
  const lifeAtRet = Math.pow(1 + ls, Math.max(0, retireYear - baseYear));

  return { plan, today, baseYear, baseMonth, f0, ov, A, people, primary, birth, retireAge, retireYear, horizonAge, endYear, nYears, infl, frac, tmid, rGroup, realRate, goals, retGoal, emergency,
    cashflowModeled, incomeReal, passiveReal, spendReal, spendMonthly, loanReal, loanInfo, freedReal, premReal, premPostReal, evReal, evPostReal, costEvents, holdings, takeContrib, retMonthly, shares, retNom, rRet, grossUp,
    lifeAtRet, lastPre, incomeMeta, eventArrays, allocW };
}

// ---------------------------------------------------------------- target corpus
export function targetFromModel(m) {
  const rows = []; let total = 0;
  for (let y = Math.max(m.retireYear, m.baseYear); y < m.endYear; y++) {
    const i = y - m.baseYear, k = y - Math.max(m.retireYear, m.baseYear);
    const byGroup = {}; let spend = 0;
    for (const g of GROUPS) { const v = m.retMonthly * 12 * (m.shares[g] || 0) * m.rGroup(g, y) * m.lifeAtRet; byGroup[g] = v; spend += v; }
    const premiums = m.premPostReal[i], events = m.evPostReal[i], passive = m.passiveReal[i];
    const net = Math.max(0, spend + premiums + events - passive), gross = net * m.grossUp, discount = Math.pow(1 + m.rRet, -k), pv = gross * discount;
    total += pv; rows.push({ year: y, age: y - m.birth, byGroup, premiums, events, passive, spend, net, gross, discount, pv });
  }
  const annualToday = m.retMonthly * 12, swr = m.A.swr;
  const classic = Object.fromEntries((m.A.swrChoices || [3, 3.25, 3.5]).map((r) => [r, annualToday / (r / 100)]));
  const passiveAtRet = rows[0]?.passive || 0;
  return { rows, total, annualToday, monthlyToday: m.retMonthly, classic, classicAt: annualToday / (swr / 100), swr, rRet: m.rRet, retNom: m.retNom, grossUp: m.grossUp,
    passiveAtRet, classicAfterPassive: Math.max(0, annualToday - passiveAtRet) / (swr / 100) };
}

// ---------------------------------------------------------------- accumulation
export function projectFromModel(m) {
  const n = m.nYears, H = m.holdings.map((h) => ({ ...h, v: h.v0 }));
  const retId = m.retGoal.id, retShare = (h) => h.split[retId] || 0;
  const goalIds = [...new Set(H.flatMap((h) => Object.keys(h.split)))];
  const goalVal = Object.fromEntries(goalIds.map((g) => [g, new Float64Array(n + 1)]));
  const classVal = Object.fromEntries(CLASSES.map((c) => [c, new Float64Array(n + 1)]));
  const snap = (i) => { for (const h of H) { for (const [g, s] of Object.entries(h.split)) goalVal[g][i] += h.v * s; for (const c of h.comps) classVal[c.cls][i] += h.v * c.w; } };
  snap(0);
  const retSum = () => sum(H.map((h) => h.v * retShare(h)));
  const rAdj = m.realRate(m.A.returns.hybrid);
  let adj = 0, deficitTotal = 0, surplusTotal = 0, unfunded = 0;
  const rows = []; let corpusAtRetire = m.retireYear <= m.baseYear ? retSum() : null;
  for (let i = 0; i < n; i++) {
    const y = m.baseYear + i, fy = m.frac(y);
    const rs = retSum(), wr = rs > 0 ? sum(H.map((h) => h.v * retShare(h) * h.rr)) / rs : rAdj;   // money taken out (or added) earns/loses the corpus's own return
    for (const h of H) h.v = h.v * Math.pow(1 + h.rr, fy) + h.contribReal[i] * Math.pow(1 + h.rr, fy / 2);
    snap(i + 1);
    const net = m.cashflowModeled ? m.incomeReal[i] - m.spendReal[i] - m.loanReal[i] - m.premReal[i] - m.evReal[i] - m.takeContrib[i] : 0;
    const row = { year: y, age: y - m.birth, income: m.incomeReal[i], spending: m.spendReal[i], emi: m.loanReal[i], premiums: m.premReal[i], events: m.evReal[i], saving: m.takeContrib[i], net,
      classes: Object.fromEntries(CLASSES.map((c) => [c, classVal[c][i + 1]])), goals: Object.fromEntries(goalIds.map((g) => [g, goalVal[g][i + 1]])), corpus: null };
    if (y < m.retireYear) {
      adj *= Math.pow(1 + wr, fy);
      if (net < 0) { adj += net; deficitTotal += -net; } else if (m.A.investSurplus) { adj += net; surplusTotal += net; }
      const base = retSum(); if (base + adj < 0) { unfunded += -(base + adj); adj = -base; }
      row.corpus = base + adj; if (y === m.retireYear - 1) corpusAtRetire = row.corpus;
    }
    rows.push(row);
  }
  const corpus = corpusAtRetire ?? 0;
  const potsToday = Object.fromEntries(CLASSES.map((c) => [c, classVal[c][0]]));
  return { rows, goalVal, classVal, potsToday, potsTotal: sum(Object.values(potsToday)), corpusAtRetire: corpus, deficitTotal, surplusTotal, unfunded };
}

/** Retirement years: balance after each year's withdrawal, and the age money runs out (null = lasts to the horizon). */
export function postRetirement(m, target, corpus) {
  const rows = []; let c = corpus, runsOutAge = null;
  for (const t of target.rows) { c = (c - t.gross) * (1 + m.rRet); if (c < 0 && runsOutAge == null) runsOutAge = t.age; rows.push({ year: t.year, age: t.age, corpus: c, withdrawal: t.gross }); if (c < 0) c = 0; }
  return { rows, runsOutAge };
}

// ---------------------------------------------------------------- goals
export function evaluateGoals(m, proj, target) {
  const out = [];
  for (const g of m.goals) {
    const base = { id: g.id, kind: g.kind, name: g.name, icon: g.icon, color: g.color, priority: g.priority };
    if (g.kind === 'retirement') {
      const funded = proj.corpusAtRetire, needed = target.total, pct = needed ? funded / needed : 1;
      out.push({ ...base, date: ymStr({ y: m.retireYear, m: 1 }), year: m.retireYear, yearsAway: Math.max(0, m.retireYear - m.baseYear), needed, funded, gap: needed - funded, pct, status: STATUS(pct), neededNominal: needed * Math.pow(1 + m.infl, Math.max(0, m.retireYear - m.baseYear)) });
      continue;
    }
    const grp = g.inflationGroup || 'general';
    let needed, funded, year = null, date = null;
    if (g.kind === 'emergency') {
      const emiNow = sum(m.plan.loans.filter((l) => l.status !== 'closed' && l.status !== 'planned').map((l) => Number(l.currentPayment ?? l.emi) || 0));
      const target0 = Number(g.target) || (m.A.bufferMonths || 6) * (m.spendMonthly + emiNow);
      needed = target0; funded = proj.goalVal[g.id]?.[0] ?? 0;
    } else {
      const gd = goalDate(g, m.plan, m.baseYear); if (!gd) { out.push({ ...base, date: null, year: null, yearsAway: null, needed: Number(g.target) || 0, funded: proj.goalVal[g.id]?.[0] ?? 0, gap: 0, pct: 0, status: 'behind', missingDate: true }); continue; }
      year = gd.y; date = ymStr(gd);
      needed = (Number(g.target) || 0) * m.rGroup(grp, Math.max(year, m.baseYear));
      const idx = Math.min(m.nYears, Math.max(0, year - m.baseYear)); funded = proj.goalVal[g.id]?.[idx] ?? 0;
    }
    const pct = needed ? funded / needed : 1, gap = needed - funded;
    let requiredMonthly = null;
    if (gap > 0 && year != null) {
      const months = Math.max(1, (year - m.baseYear) * 12 - (m.baseMonth - 1)); const rm = Math.pow(1 + m.realRate(m.A.newMoneyReturn), 1 / 12) - 1;
      requiredMonthly = gap / (rm ? (Math.pow(1 + rm, months) - 1) / rm : months);   // today's rupees per month
    }
    out.push({ ...base, date, year, yearsAway: year != null ? Math.max(0, year - m.baseYear) : null, needed, funded, gap, pct, status: STATUS(pct), requiredMonthly,
      neededNominal: year != null ? needed * Math.pow(1 + m.infl, Math.max(0, year - m.baseYear)) : needed });
  }
  return out.sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
}

// ---------------------------------------------------------------- the plan result
export function runPlan(planIn, opts = {}) {
  const m = buildModel(planIn, opts);
  const target = targetFromModel(m), proj = projectFromModel(m), post = postRetirement(m, target, proj.corpusAtRetire);
  const goals = evaluateGoals(m, proj, target);
  const projected = proj.corpusAtRetire, gapAmt = target.total - projected;
  const yrs = Math.max(0, m.retireYear - m.baseYear), nominalFactor = Math.pow(1 + m.infl, yrs);
  const activeSips = m.plan.holdings.filter((h) => h.include !== false).flatMap((h) => (h.sips || []).filter((x) => x.status !== 'paused' && x.status !== 'stopped').map((x) => ({ ...x, per: (x.frequency === 'quarterly' ? 1 / 3 : x.frequency === 'yearly' ? 1 / 12 : 1) * (Number(x.amount) || 0) })));
  const takeHome = sum(m.plan.incomes.filter((i) => i.include !== false && i.type !== 'passive' && (i.untilYear == null || i.untilYear > m.baseYear)).map((i) => Number(i.takeHome ?? i.monthly) || 0));
  const passiveNow = sum(m.plan.incomes.filter((i) => i.include !== false && i.type === 'passive').map((i) => Number(i.takeHome ?? i.monthly) || 0));
  const sipNow = sum(activeSips.map((x) => x.per)), sipTake = sum(activeSips.filter((x) => !x.payroll).map((x) => x.per));
  const emiNow = sum(m.plan.loans.filter((l) => l.status !== 'closed' && l.status !== 'planned').map((l) => Number(l.currentPayment ?? l.emi) || 0));
  const income = takeHome + passiveNow;
  const meta = { baseYear: m.baseYear, today: m.today, retireAge: m.retireAge, retireYear: m.retireYear, yearsToRet: yrs, horizonAge: m.horizonAge, infl: m.infl, birth: m.birth, ageNow: m.baseYear - m.birth,
    takeHome: income, spendNow: m.spendMonthly, emiNow, sipNow, sipTake, freeCash: income - m.spendMonthly - emiNow - sipTake, savingsRate: income ? sipNow / income : 0, scenarioId: m.plan.settings.activeScenarioId, nominalFactor };
  return { model: m, meta, target, projection: proj, post, goals,
    gap: { amount: gapAmt, projected, target: target.total, pct: target.total ? projected / target.total : 1, status: STATUS(target.total ? projected / target.total : 1), nominalAmount: gapAmt * nominalFactor,
      nominalTarget: target.total * nominalFactor, nominalProjected: projected * nominalFactor, deficitTotal: proj.deficitTotal, unfunded: proj.unfunded, runsOutAge: post.runsOutAge } };
}

// ---------------------------------------------------------------- solvers ("how do I close the gap")
const gapOf = (plan, opts) => runPlan(plan, opts).gap.amount;
const bisect = (f, lo, hi, tol = 0.01, it = 40) => { let flo = f(lo); if (flo <= 0) return lo; if (f(hi) > 0) return null; for (let i = 0; i < it; i++) { const mid = (lo + hi) / 2; const v = f(mid); if (v > 0) lo = mid; else hi = mid; if (hi - lo < tol) break; } return hi; };

/** Linear levers use two runs; later retirement age and income growth are searched. */
export function closeGap(plan, opts = {}) {
  const base = runPlan(plan, opts), gap = base.gap.amount;
  const ovBase = opts.overrides || {};
  const out = { gap, extraMonthly: 0, laterAge: null, lowerSpend: 0, earnMoreDelta: null, higherReturnDelta: null, ageGap: [] };
  if (gap <= 0) { out.laterAge = base.meta.retireAge; return out; }
  const p1 = runPlan(plan, { ...opts, overrides: { ...ovBase, extraMonthly: (ovBase.extraMonthly || 0) + 1000 } });
  const k = (p1.gap.projected - base.gap.projected) / 1000;
  out.extraMonthly = k > 0 ? gap / k : null;
  const t1 = runPlan(plan, { ...opts, overrides: { ...ovBase, spendCutMonthly: (ovBase.spendCutMonthly || 0) + 1000 } });
  const slope = (base.target.total - t1.target.total) / 1000;
  out.lowerSpend = slope > 0 ? Math.min(base.target.monthlyToday, gap / slope) : null; out.lowerSpendPossible = slope > 0 && gap / slope <= base.target.monthlyToday;
  out.earnMoreDelta = bisect((d) => gapOf(plan, { ...opts, overrides: { ...ovBase, incomeGrowthDeltaPct: (ovBase.incomeGrowthDeltaPct || 0) + d } }), 0, 15, 0.05);
  out.higherReturnDelta = bisect((d) => gapOf(plan, { ...opts, overrides: { ...ovBase, returnDeltaPct: (ovBase.returnDeltaPct || 0) + d } }), 0, 10, 0.05);
  const a0 = base.meta.retireAge;
  for (let a = a0; a <= a0 + 15; a++) { const g = gapOf(plan, { ...opts, retireAge: a }); out.ageGap.push({ age: a, gap: g }); if (out.laterAge == null && g <= 0) out.laterAge = a; }
  return out;
}

/** Gap and funded share for every retirement age from 45 to 60 (the Overview strip). */
export function ageGrid(plan, opts = {}, from = 45, to = 60) {
  const rows = [];
  for (let a = from; a <= to; a++) { const r = runPlan(plan, { ...opts, retireAge: a }); rows.push({ age: a, year: r.meta.retireYear, gap: r.gap.amount, pct: r.gap.pct, target: r.gap.target, projected: r.gap.projected }); }
  return rows;
}
export const earliestAge = (rows) => rows.find((r) => r.gap <= 0)?.age ?? null;

/** How much each lever moves the gap (tornado). */
export function sensitivity(plan, opts = {}) {
  const base = runPlan(plan, opts).gap.amount; const ovBase = opts.overrides || {};
  const lever = (label, lo, hi, unit) => { const g = (o, extra = {}) => gapOf(plan, { ...opts, ...extra, overrides: { ...ovBase, ...o } });
    const a = lo.retireAge ? g({}, { retireAge: lo.retireAge }) : g(lo), b = hi.retireAge ? g({}, { retireAge: hi.retireAge }) : g(hi); return { label, unit, low: a, high: b, base, swing: Math.abs(a - b) }; };
  const ra = runPlan(plan, opts).meta.retireAge;
  return [
    lever('Monthly saving ±20%', { sipFactor: 0.8 }, { sipFactor: 1.2 }, '±20%'),
    lever('Retirement age ±2 years', { retireAge: ra - 2 }, { retireAge: ra + 2 }, '±2 yrs'),
    lever('Equity return ±2 points', { equityReturnDeltaPct: -2 }, { equityReturnDeltaPct: 2 }, '±2 pts'),
    lever('Retirement spending ±10%', { retireSpendFactor: 1.1 }, { retireSpendFactor: 0.9 }, '±10%'),
    lever('Inflation ±1 point', { inflationDeltaPct: 1 }, { inflationDeltaPct: -1 }, '±1 pt'),
    lever('Income growth ±2 points', { incomeGrowthDeltaPct: -2 }, { incomeGrowthDeltaPct: 2 }, '±2 pts'),
  ].sort((a, b) => b.swing - a.swing);
}

/** Effect of each life event on the retirement corpus (projected with it minus without it). */
export function eventImpacts(plan, opts = {}) {
  const base = runPlan(plan, opts).gap.projected;
  return (plan.events || []).filter((e) => e.enabled !== false).map((e) => {
    const p2 = { ...plan, events: plan.events.map((x) => (x.id === e.id ? { ...x, enabled: false } : x)) };
    return { id: e.id, impact: base - runPlan(p2, opts).gap.projected };   // negative = the event reduces the corpus
  });
}

/** Deterministic summary of every scenario: earliest working age and corpus at that age. */
export function compareScenarios(plan, opts = {}) {
  return allScenarios(plan).map((sc) => {
    const o = { ...opts, scenarioId: sc.id }; const grid = ageGrid(plan, o); const age = earliestAge(grid);
    const at = runPlan(plan, { ...o, retireAge: age ?? runPlan(plan, o).meta.retireAge });
    return { scenario: sc, earliestAge: age, grid, atAge: at.meta.retireAge, corpus: at.gap.projected, target: at.gap.target, gap: at.gap.amount, retireMonthly: at.target.monthlyToday, incomeGrowth: (plan.assumptions.salaryGrowth ?? 8) + (sc.overrides?.incomeGrowthDeltaPct || 0), equityReturn: (plan.assumptions.returns?.equity ?? 12) + (sc.overrides?.equityReturnDeltaPct || 0) };
  });
}
