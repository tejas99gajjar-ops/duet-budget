// "Is anything off?" Plain-language sanity checks on the plan: things that quietly make the answer too hopeful or too gloomy.
import { holdingValue } from './engine.js';
import { inrC } from './format.js';

const sum = (a) => a.reduce((s, x) => s + x, 0);

/** Returns [{level: 'warn' | 'info' | 'good', icon, title, text, to}] most important first. */
export function modelChecks(plan, res, mc) {
  const out = [], A = plan.assumptions, m = res.meta, t = res.target, rows = res.projection.rows, pre = rows.filter((r) => r.year < m.retireYear);
  const add = (level, icon, title, text, to) => out.push({ level, icon, title, text, to });

  // 1. Money going out faster than it comes in before retirement
  const deficitYears = pre.filter((r) => r.net < -1);
  if (res.projection.deficitTotal > 0 && deficitYears.length) {
    const a = deficitYears[0].year, b = deficitYears[deficitYears.length - 1].year;
    add('warn', '🕳️', 'Some years cost more than you earn', `${a === b ? `In ${a}` : `Between ${a} and ${b}`} your pay does not cover spending, EMIs and SIPs. About ${inrC(res.projection.deficitTotal)} (in today's money) is taken out of your investments to fill the hole, which is already counted in the result. A longer loan tenure, lower spending or more income would shrink it.`, '#/fire/inputs/loans');
  }
  // 2. Spare cash that the plan is not using
  const spare = pre.filter((r) => r.net > 1);
  if (!A.investSurplus && spare.length) {
    const avg = sum(spare.map((r) => r.net)) / spare.length / 12;
    if (avg > 2000) add('info', '💤', 'Spare cash is not counted', `In a typical year you have about ${inrC(avg)} a month left after spending, EMIs and SIPs. The plan does not count it unless you invest it. Raise a SIP, or switch on "Count leftover cash as invested" in Assumptions to see the effect.`, '#/fire/inputs/assumptions');
  }
  // 3. Pay growing slower than prices
  if ((A.salaryGrowth ?? 0) < A.inflation.general) add('info', '📉', 'Your pay buys less every year', `Pay grows ${A.salaryGrowth}% a year but prices rise ${A.inflation.general}%. In real terms your income shrinks each year, so saving gets harder unless pay rises faster.`, '#/fire/inputs/income');
  // 4. Withdrawal rate implied by the target
  const implied = t.total ? (t.annualToday / t.total) * 100 : 0;
  if (implied > 3.6) add('warn', '⚖️', 'The target assumes a fairly high withdrawal rate', `Your target works out to taking ${implied.toFixed(1)}% of the corpus each year. For a retirement this long, 3 to 3.5% is the usual cautious range, which would ask for ${inrC(t.classicAt)}.`, '#/fire/detail/target');
  // 5. Return assumptions
  if (A.returns.equity > 12) add('warn', '🎯', 'Equity return looks high', `You assume ${A.returns.equity}% a year from equity. Long-run Indian equity has given roughly 10 to 12% before costs and tax. Higher numbers make the plan look better than it is.`, '#/fire/inputs/assumptions');
  // 6. Money held in someone else's name
  const total = sum(plan.holdings.filter((h) => h.include !== false).map(holdingValue)) || 1;
  const family = sum(plan.holdings.filter((h) => h.include !== false && h.familyHeld).map(holdingValue));
  if (A.includeFamilyFunds && family / total > 0.15) add('warn', '👪', `${Math.round((family / total) * 100)}% of your investments are in a family member's name`, `${inrC(family)} is counted as yours, but legally it belongs to them. Switch it off in Assumptions to see the plan without it.`, '#/fire/inputs/assumptions');
  // 7. One holding dominating
  const big = [...plan.holdings].filter((h) => h.include !== false && !h.familyHeld && h.kind !== 'epf' && h.kind !== 'nps').sort((a, b) => holdingValue(b) - holdingValue(a))[0];
  if (big && holdingValue(big) / total > 0.4) add('info', '🧺', 'One holding is a large part of the total', `${big.name} is ${Math.round((holdingValue(big) / total) * 100)}% of everything. A bad year for it moves the whole plan.`, '#/fire/inputs/assets');
  // 8. Safety cash
  const cash = sum(plan.holdings.filter((h) => h.include !== false && (h.assetClass === 'cash' || h.kind === 'cash')).map(holdingValue));
  const monthlyNeed = m.spendNow + m.emiNow, months = monthlyNeed ? cash / monthlyNeed : 0;
  if (cash && months < (A.bufferMonths || 6)) add('warn', '🛟', 'Emergency cash is thin', `Your cash covers about ${months.toFixed(1)} months of spending and EMIs. Most people keep ${A.bufferMonths || 6}. A job gap or hospital bill would force you to sell investments.`, '#/fire/goals');
  // 9. Insurance
  if (!plan.insurance.some((i) => i.kind === 'health')) add('warn', '🏥', 'No health insurance recorded', 'A hospital stay could cost lakhs and is not covered in the numbers. This matters most around the baby and in your first retirement years.', '#/fire/inputs/insurance');
  const term = sum(plan.insurance.filter((i) => i.kind === 'term').map((i) => Number(i.cover) || 0));
  if (m.takeHome && !term) add('info', '🛡️', 'No term life cover recorded', `Your family depends on ${inrC(m.takeHome * 12)} a year of income. Pure term cover of 10 to 12 times that is the usual guide.`, '#/fire/inputs/insurance');
  // 10. Guessed numbers
  const guessed = plan.events.filter((e) => e.enabled !== false && e.estimate), review = plan.loans.filter((l) => l.needsReview);
  if (guessed.length || review.length) add('info', '✏️', 'Some numbers are placeholders', `${[...guessed.map((e) => e.name), ...review.map((l) => `${l.name} tenure`)].join('; ')}. The result moves when you replace them with real figures.`, '#/fire/inputs');
  // 11. Monte Carlo against the straight-line answer
  const need = (A.successThreshold ?? 80) / 100;
  if (mc && res.gap.pct >= 1 && mc.success < need) add('warn', '🎲', 'Fine on average, risky in bad markets', `The straight-line projection says you are on track, but only ${Math.round(mc.success * 100)}% of simulated futures keep your money lasting to ${mc.horizonAge}. A crash early in retirement does the damage.`, '#/fire/detail/mc');
  if (!out.length) add('good', '✅', 'Nothing looks off', 'No obvious gaps or over-hopeful assumptions found.', null);
  const rank = { warn: 0, info: 1, good: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}
