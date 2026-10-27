// A FICTIONAL sample plan (numbers follow the reference designs) for trying the planner in the harness. Not anyone's real data.
export function samplePlan() {
  const sip = (id, amount, extra = {}) => ({ id, amount, frequency: 'monthly', start: '2026-01', stepUpPct: 8, status: 'active', ...extra });
  return {
    name: "Arjun's Plan 2040",
    profile: { people: [{ id: 'p1', role: 'primary', name: 'Arjun', dob: '1991-03-12', retireAge: 50, workStatus: 'working' }, { id: 'p2', role: 'partner', name: 'Priya', dob: '1993-09-07', retireAge: 48, workStatus: 'working', workEndYear: 2031 }], horizonAge: 90,
      children: [{ id: 'c1', name: 'Child 1', birthYear: 2019, dependentUntilAge: 25 }, { id: 'c2', name: 'Child 2 (planned)', birthYear: 2027, planned: true }] },
    incomes: [
      { id: 'i1', person: 'p1', label: 'Arjun · Salary', type: 'active', sourceTag: 'Salary', takeHome: 185000, gross: 240000, growthPct: 8, source: 'entered' },
      { id: 'i2', person: 'p2', label: 'Priya · Salary', type: 'active', sourceTag: 'Salary', takeHome: 55000, growthPct: 6, untilYear: 2031, source: 'entered' },
      { id: 'i3', person: 'p1', label: 'Rental income', type: 'passive', sourceTag: 'Rent', takeHome: 15000, growthPct: 5, continuesPostRetirement: true, source: 'entered' },
    ],
    spending: { currentMonthly: 85000, mapping: {}, retirement: { monthly: 150000, shares: null },
      categories: [['household', 'Household', '🏠', 'general', 28000, '#7C5FE6'], ['food', 'Food & Dining', '🍽️', 'general', 18000, '#F5A623'], ['transport', 'Transport', '🚗', 'general', 12000, '#3B82F6'], ['health', 'Healthcare', '⚕️', 'medical', 8000, '#1DDB97'], ['education', 'Education (kids)', '🎓', 'education', 12000, '#E879A0'], ['leisure', 'Leisure & Others', '🎭', 'general', 7000, '#8B97B3']]
        .map(([id, name, icon, group, monthly, color]) => ({ id, name, icon, group, monthly, color, source: 'entered' })) },
    holdings: [
      { id: 'h1', name: 'Equity MF / Stocks', kind: 'mf', assetClass: 'equity', owner: 'p1', value: 8500000, invested: 6200000, sips: [sip('s1', 55000)] },
      { id: 'h2', name: 'Hybrid Fund', kind: 'mf', assetClass: 'hybrid', owner: 'p1', value: 3200000, sips: [sip('s2', 15000)], goalSplit: { g_edu: 50 } },
      { id: 'h3', name: 'Debt Fund', kind: 'mf', assetClass: 'debt', owner: 'p1', value: 1800000, sips: [sip('s3', 8000)] },
      { id: 'h4', name: 'EPF', kind: 'epf', assetClass: 'epf', owner: 'p1', value: 4200000, sips: [{ id: 's4', amount: 21000, frequency: 'monthly', start: '2026-01', followsIncome: true, payroll: true, status: 'active' }] },
      { id: 'h5', name: 'NPS', kind: 'nps', assetClass: 'nps', owner: 'p1', value: 2800000, sips: [sip('s5', 7000)] },
      { id: 'h6', name: 'Emergency cash', kind: 'cash', assetClass: 'cash', owner: 'p1', value: 800000, sips: [] },
    ],
    loans: [{ id: 'l1', name: 'Home Loan', tag: 'Home', lender: 'SBI Housing Finance', borrower: 'joint', status: 'active', principal: 7000000, outstanding: 4800000, ratePct: 8.6, rateType: 'floating', emi: 38500, redirectFreed: true }],
    insurance: [
      { id: 'n1', kind: 'term', holder: 'p1', name: 'Term Plan · Arjun', insurer: 'Sample Life', cover: 15000000, premium: 16000, frequency: 'yearly', coverTillAge: 65, status: 'confirmed' },
      { id: 'n2', kind: 'term', holder: 'p2', name: 'Term Plan · Priya', insurer: 'Sample Life', cover: 5000000, premium: 8000, frequency: 'yearly', coverTillAge: 60, status: 'confirmed' },
      { id: 'n3', kind: 'health', holder: 'p1', name: 'Health · Family floater', insurer: 'Sample Health', cover: 2000000, premium: 22000, frequency: 'yearly', status: 'confirmed' },
    ],
    events: [
      { id: 'e1', kind: 'school', name: "Child's School Fees Start", date: '2027-04', annualCost: 120000, durationYears: 12, inflationGroup: 'education', enabled: true },
      { id: 'e2', kind: 'work_stop', name: 'Priya Stops Working', date: '2031-01', incomeId: 'i2', enabled: true },
      { id: 'e3', kind: 'custom', name: 'Child Higher Education', date: '2039-06', cost: 3500000, goalId: 'g_edu', inflationGroup: 'education', enabled: true },
      { id: 'e4', kind: 'family', name: "Daughter's Wedding", date: '2046-01', cost: 2500000, goalId: 'g_wed', enabled: true },
    ],
    goals: [
      { id: 'g_ret', kind: 'retirement', name: 'Retirement Corpus', icon: '🌴', color: '#7C5FE6', priority: 1 },
      { id: 'g_edu', kind: 'education', name: "Child's Higher Education", icon: '🎓', color: '#3B82F6', priority: 2, target: 4000000, date: '2039-06', inflationGroup: 'education' },
      { id: 'g_wed', kind: 'family', name: "Daughter's Wedding", icon: '💐', color: '#E879A0', priority: 3, target: 2500000, date: '2046-01', inflationGroup: 'general', monthlyAlloc: 8000, stepUpPct: 5 },
      { id: 'g_em', kind: 'emergency', name: 'Emergency Fund', icon: '🛡️', color: '#F5A623', priority: 4 },
    ],
  };
}
