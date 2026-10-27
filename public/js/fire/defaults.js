// Defaults and constants for the FIRE planner. All plan money values are in rupees, "today's money" unless stated.

export const CLASSES = ['equity', 'hybrid', 'debt', 'epf', 'nps', 'cash', 'gold', 'other'];
export const CLASS_INFO = {
  equity: { label: 'Equity MF / Stocks', short: 'Equity', color: '#7C5FE6', ret: 12, vol: 15, beta: 1.0 },
  hybrid: { label: 'Hybrid Fund', short: 'Hybrid', color: '#3B82F6', ret: 9, vol: 9, beta: 0.85 },
  debt: { label: 'Debt Fund', short: 'Debt', color: '#1DDB97', ret: 7.5, vol: 3, beta: 0.25 },
  epf: { label: 'EPF', short: 'EPF', color: '#F5A623', ret: 8.1, vol: 0.5, beta: 0 },
  nps: { label: 'NPS', short: 'NPS', color: '#E879A0', ret: 10, vol: 10, beta: 0.8 },
  cash: { label: 'Cash & savings', short: 'Cash', color: '#8B97B3', ret: 4, vol: 0.5, beta: 0 },
  gold: { label: 'Gold', short: 'Gold', color: '#F5C518', ret: 8, vol: 14, beta: 0.1 },
  other: { label: 'Other', short: 'Other', color: '#38BDF8', ret: 6, vol: 10, beta: 0.5 },
};
export const GROUPS = ['general', 'medical', 'education', 'housing'];
export const GROUP_LABEL = { general: 'General living', medical: 'Medical', education: 'Education', housing: 'Housing' };

export const HOLDING_KINDS = {
  stock: 'Direct stock', mf: 'Mutual fund', etf: 'ETF / index fund', bond: 'Bond / debt instrument', epf: 'EPF', nps: 'NPS', ulip: 'ULIP', gold: 'Gold', cash: 'Cash / savings', property: 'Property', other: 'Other',
};
export const KIND_DEFAULT_CLASS = { stock: 'equity', mf: 'equity', etf: 'equity', bond: 'debt', epf: 'epf', nps: 'nps', ulip: 'hybrid', gold: 'gold', cash: 'cash', property: 'other', other: 'other' };
export const SUBTYPES = ['Large cap', 'Mid or small cap', 'Index', 'Flexi cap', 'Sectoral', 'International', 'Arbitrage', 'Liquid', 'Corporate bond', 'Government bond'];

export const LOAN_TAGS = ['Education', 'Car', 'Home', 'Personal', 'Credit card', 'Gold', 'Business', 'Other'];
export const INCOME_SOURCES = ['Salary', 'Bonus', 'Variable pay', 'Rent', 'Interest', 'Dividend', 'Business', 'Freelance', 'Gift', 'Other'];
export const INSURANCE_KINDS = { term: 'Term life', health: 'Health', ulip: 'ULIP', other: 'Other' };

export const GOAL_KINDS = {
  retirement: { label: 'Retirement', icon: '🌴', color: '#7C5FE6', group: 'general' },
  education: { label: 'Child education', icon: '🎓', color: '#3B82F6', group: 'education' },
  house: { label: 'House', icon: '🏠', color: '#F04444', group: 'housing' },
  car: { label: 'Car replacement', icon: '🚗', color: '#F5A623', group: 'general' },
  emergency: { label: 'Emergency fund', icon: '🛡️', color: '#F5A623', group: 'general' },
  travel: { label: 'Travel', icon: '✈️', color: '#38BDF8', group: 'general' },
  family: { label: 'Family event', icon: '💐', color: '#E879A0', group: 'general' },
  custom: { label: 'Custom', icon: '🎯', color: '#1DDB97', group: 'general' },
};
export const EVENT_KINDS = {
  baby: { label: 'Baby', icon: '👶' }, loan_start: { label: 'Education loan EMI start', icon: '🎓' }, house: { label: 'House', icon: '🏠' }, car: { label: 'Car', icon: '🚗' },
  school: { label: 'School or college fees', icon: '📚' }, lifestyle: { label: 'Lifestyle upgrade', icon: '✨' }, medical: { label: 'Medical shock', icon: '🏥' },
  job: { label: 'Job change', icon: '💼' }, work_stop: { label: 'Stops working', icon: '⏸️' }, work_start: { label: 'Returns to work', icon: '▶️' }, custom: { label: 'Custom', icon: '📌' },
};

export const DEFAULT_ASSUMPTIONS = {
  inflation: { general: 6, medical: 8, education: 9, housing: 6 },
  returns: Object.fromEntries(Object.entries(CLASS_INFO).map(([k, v]) => [k, v.ret])),
  vol: Object.fromEntries(Object.entries(CLASS_INFO).map(([k, v]) => [k, v.vol])),
  inflationVol: 1.5,
  swr: 3.5,
  taxPct: 30,            // effective tax rate on the gains part of redemptions
  gainSharePct: 35,      // share of a withdrawal that is gain (taxable)
  retirementAllocation: { equity: 35, hybrid: 20, debt: 45 },
  newMoneyReturn: 11,    // return on newly added savings (60% equity / 40% hybrid blend)
  salaryGrowth: 8,
  bufferMonths: 6,
  includeFamilyFunds: true,
  includeHouse: false,
  investSurplus: false,
  redirectFreedEmi: true,
  lifestyleInflation: { on: false, pct: 2 },
  swrChoices: [3, 3.25, 3.5],
  successThreshold: 80,
};

export const DEFAULT_SETTINGS = {
  basis: 'today',            // 'today' | 'nominal'
  activeScenarioId: 'base',
  retireAge: null,           // null = primary person's retirement age
  mc: { paths: 10000, seed: 20261026, fixedSeed: true, equityVol: null, includeEvents: true, sequenceRisk: true },
  lakhCrore: true,
  wizardDone: false,
  disclaimerAccepted: false,
};

export const BUILTIN_SCENARIOS = [
  { id: 'optimistic', builtin: true, name: 'Optimistic', icon: '🚀', desc: 'Higher income + lower spend', overrides: { incomeGrowthDeltaPct: 4, retireSpendFactor: 0.8 } },
  { id: 'base', builtin: true, name: 'Base', icon: '📐', desc: 'Current assumptions', overrides: {} },
  { id: 'pessimistic', builtin: true, name: 'Pessimistic', icon: '⚠️', desc: 'Market downturn + income plateau', overrides: { incomeGrowthDeltaPct: -3, retireSpendFactor: 1.2, equityReturnDeltaPct: -4 } },
];

/** Planner spending buckets and the Duet categories they start from. */
export const SPEND_BUCKETS = [
  { id: 'household', name: 'Household', icon: '🏠', group: 'general', color: '#7C5FE6', duet: ['Home', 'Bills & Utilities'] },
  { id: 'food', name: 'Food & Dining', icon: '🍽️', group: 'general', color: '#F5A623', duet: ['Food & Drinks', 'Groceries'] },
  { id: 'transport', name: 'Transport', icon: '🚗', group: 'general', color: '#3B82F6', duet: ['Transport'] },
  { id: 'health', name: 'Healthcare', icon: '⚕️', group: 'medical', color: '#1DDB97', duet: ['Health'] },
  { id: 'education', name: 'Education (kids)', icon: '🎓', group: 'education', color: '#E879A0', duet: [] },
  { id: 'leisure', name: 'Leisure & Others', icon: '🎭', group: 'general', color: '#8B97B3', duet: ['Entertainment', 'Travel', 'Shopping', 'Other'] },
];

export const uid = (p = 'x') => p + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);

export function defaultPlan({ today = new Date().toISOString().slice(0, 10), name } = {}) {
  return {
    name: name || 'My FIRE Plan',
    profile: {
      people: [{ id: 'p1', role: 'primary', name: 'You', dob: null, birthYear: Number(today.slice(0, 4)) - 30, retireAge: 50, workStatus: 'working', workEndYear: null }],
      horizonAge: 90,
      children: [],
    },
    incomes: [],
    spending: { currentMonthly: 0, categories: [], mapping: {}, retirement: { monthly: null, shares: null }, oneOffsExcluded: [] },
    holdings: [],
    loans: [],
    insurance: [],
    events: [],
    goals: [{ id: 'g_ret', kind: 'retirement', name: 'Retirement corpus', icon: '🌴', color: '#7C5FE6', priority: 1, archived: false, target: null, date: null, inflationGroup: 'general', monthlyAlloc: 0, notes: '' }],
    scenarios: JSON.parse(JSON.stringify(BUILTIN_SCENARIOS.filter((s) => !s.builtin))),
    assumptions: JSON.parse(JSON.stringify(DEFAULT_ASSUMPTIONS)),
    settings: JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
  };
}

function merge(base, over) {
  if (Array.isArray(base) || Array.isArray(over) || typeof base !== 'object' || base === null) return over === undefined ? base : over;
  const out = { ...base };
  for (const k of Object.keys(over || {})) out[k] = k in base ? merge(base[k], over[k]) : over[k];
  return out;
}
/** Fills any missing fields with defaults so older or partial plans always load. */
export function normalizePlan(p) {
  const d = defaultPlan();
  const out = { ...d, ...p };
  out.profile = merge(d.profile, p?.profile || {});
  out.assumptions = merge(d.assumptions, p?.assumptions || {});
  if (p?.assumptions?.retirementAllocation) out.assumptions.retirementAllocation = { ...p.assumptions.retirementAllocation };   // replace, never merge, a weighting
  out.settings = merge(d.settings, p?.settings || {});
  out.spending = merge(d.spending, p?.spending || {});
  for (const k of ['incomes', 'holdings', 'loans', 'insurance', 'events', 'goals', 'scenarios']) out[k] = Array.isArray(p?.[k]) ? p[k] : d[k];
  if (!out.goals.some((g) => g.kind === 'retirement')) out.goals = [...d.goals, ...out.goals];
  return out;
}
