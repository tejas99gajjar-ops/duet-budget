// Screens: Guide (glossary, data sources, colour meanings) and How it works (end-to-end flow, analogy, key assumptions that update with your numbers).
import { h, bind, IC, chip, tile, note, bar, head, fxNav, srcChip } from './ui.js';
import { html } from '../core.js';
import * as FS from './store.js';
import * as X from './ctx.js';
import * as D from './duet.js';
import { TERMS, GROUPS, openTerm } from './terms.js';
import { DEFAULT_ASSUMPTIONS, CLASS_INFO } from './defaults.js';
import { holdingValue, sensitivity, compareScenarios } from './engine.js';
import { inr, inrC, inrF, pc } from './format.js';

const sum = (a) => a.reduce((s, x) => s + x, 0);
let query = '', group = 'all';

// Where every number in the planner comes from, and what it feeds.
const datasets = (plan, res) => [
  ['👤', 'Profile', '#/fire/inputs/profile', `${plan.profile.people.length} people, retire at ${res.meta.retireAge}`, 'Ages, years to retirement, how long the money must last'],
  ['💰', 'Income', '#/fire/inputs/income', `${plan.incomes.length} sources, ${inrC(res.meta.takeHome)}/mo`, 'Cash flow each year, what you can save, when it stops'],
  ['🛒', 'Spending', '#/fire/inputs/spending', `${inrC(res.meta.spendNow)}/mo now`, 'Cost of living today and the target corpus'],
  ['📈', 'Assets & SIPs', '#/fire/inputs/assets', `${plan.holdings.length} holdings, ${inrC(sum(plan.holdings.filter((h2) => h2.include !== false).map(holdingValue)))}`, 'Starting pot and what you keep adding'],
  ['🏠', 'Loans', '#/fire/inputs/loans', `${plan.loans.length} loans, ${inrC(res.meta.emiNow)}/mo EMI`, 'Money leaving each year and when it is freed up'],
  ['🛡️', 'Insurance', '#/fire/inputs/insurance', `${plan.insurance.length} policies`, 'Premiums and protection'],
  ['🎯', 'Life events', '#/fire/inputs/events', `${plan.events.length} events`, 'One-off and yearly costs on set dates'],
  ['⚙️', 'Assumptions', '#/fire/inputs/assumptions', `Inflation ${plan.assumptions.inflation.general}%, equity ${plan.assumptions.returns.equity}%`, 'How fast prices and investments move'],
  ['🔗', 'Duet budget data', '#/fire/live', D.hasDuet() ? `${D.proposals(plan, X.today()).length} suggested updates` : 'Not loaded', 'Your real income, spending and balances. Offered to the planner, never applied without you'],
];

const COLORS = [['ok', 'Green', 'Good: ahead of target, on track, or healthy.'], ['warn', 'Amber', 'Needs attention: close to the line, an estimate, or something missing.'], ['bad', 'Red', 'Risk or shortfall: a gap, a cost, or something to fix.'], ['pur', 'Purple', 'The planner itself: your target, your plan, buttons you can press.'], ['blue', 'Blue', 'Information that came from your Duet budget data.']];

export function learn(root, { parts }) {
  const plan = X.getPlan(), res = X.run();
  const list = () => TERMS.filter((t) => (group === 'all' || t.group === group) && (!query || `${t.name} ${t.short} ${t.aliases.join(' ')}`.toLowerCase().includes(query.toLowerCase())));
  const row = (t) => h`<button class="fx-li" data-term="${t.id}" style="align-items:flex-start;padding:12px 0"><span class="grow" style="min-width:0"><b>${t.name}</b><div class="fx-sub" style="margin-top:2px">${t.short}</div></span>${IC.chev}</button>`;
  html(root, h`<div class="fx">${head({ kicker: 'FIRE PLANNER', title: 'Guide', back: '#/fire', sub: 'Everything in plain words, with your own numbers.' })}
    <div class="fx-card glow"><div class="fx-lbl">START HERE</div>
      <div class="fx-list" style="margin-top:6px">
        <a class="fx-li" href="#/fire/how"><span class="fx-ico" style="background:var(--fx-tile)">🧭</span><span class="grow"><b>How the planner works</b><div class="fx-sub">From your inputs to your answer, step by step</div></span>${IC.chev}</a>
        <a class="fx-li" href="#/fire/how/assumptions"><span class="fx-ico" style="background:var(--fx-tile)">🎚️</span><span class="grow"><b>Your key assumptions</b><div class="fx-sub">The ones that move your answer most, kept up to date</div></span>${IC.chev}</a>
        <a class="fx-li" href="#/fire/detail/calc"><span class="fx-ico" style="background:var(--fx-tile)">🧮</span><span class="grow"><b>How we worked out your number</b><div class="fx-sub">With everyday analogies and a worked example</div></span>${IC.chev}</a></div></div>

    <div class="fx-card"><div class="fx-lbl" style="margin-bottom:10px">TERMS A TO Z (${TERMS.length})</div>
      <div class="fx-f"><input class="fx-in" id="q" type="search" placeholder="Search a word, for example inflation" value="${query}" aria-label="Search terms" autocomplete="off" data-nolink></div>
      <div class="fx-chips" style="margin:10px 0 4px;overflow-x:auto;flex-wrap:nowrap"><button class="fx-opt ${group === 'all' ? 'on' : ''}" data-act="grp" data-k="all">All</button>${GROUPS.map(([k, l, i]) => h`<button class="fx-opt ${group === k ? 'on' : ''}" data-act="grp" data-k="${k}" style="white-space:nowrap">${i} ${l}</button>`)}</div>
      <div class="fx-list" id="terms" data-nolink>${list().map(row)}${!list().length ? h`<div class="fx-sub" style="padding:10px 0">No match. Try a shorter word.</div>` : ''}</div></div>

    <div class="fx-card"><div class="fx-lbl" style="margin-bottom:4px">WHERE EVERY NUMBER COMES FROM</div><div class="fx-sub" style="margin-bottom:6px">Change any of these and the whole plan recalculates.</div>
      <div class="fx-list">${datasets(plan, res).map(([i, n, to, now, drives]) => h`<a class="fx-li" href="${to}" style="align-items:flex-start;padding:12px 0"><span class="fx-ico" style="background:var(--fx-tile)">${i}</span><span class="grow" style="min-width:0"><b>${n}</b> <span class="fx-sub">· ${now}</span><div class="fx-sub" style="margin-top:2px">Feeds: ${drives}</div></span>${IC.chev}</a>`)}</div></div>

    <div class="fx-card"><div class="fx-lbl" style="margin-bottom:8px">WHAT THE COLOURS MEAN</div><div class="col" style="gap:10px">${COLORS.map(([c, n, d]) => h`<div class="fx-row" style="gap:12px;align-items:flex-start"><span class="fx-dot ${c === 'ok' ? 'ok' : c === 'warn' ? 'warn' : c === 'bad' ? 'bad' : ''}" style="flex:none;margin-top:5px;${c === 'pur' ? 'background:var(--fx)' : c === 'blue' ? 'background:#4C8DF6' : ''}"></span><span><b class="${c}">${n}</b><div class="fx-sub">${d}</div></span></div>`)}</div>
      <div class="fx-row" style="gap:8px;margin-top:12px;flex-wrap:wrap">${srcChip('duet')}${srcChip('entered')}${srcChip('est')}${srcChip('def')}</div><div class="fx-sub" style="margin-top:6px">Small tags show where a number came from: your Duet data, typed by you, an estimate, or a default.</div></div>
    ${fxNav('overview')}</div>`);
  bind(root, { click: { grp: (el) => { group = el.dataset.k; X.redraw(); } } });
  const q = root.querySelector('#q');
  q?.addEventListener('input', () => { query = q.value; const box = root.querySelector('#terms'); box.innerHTML = (list().length ? list().map(row).map((x) => x.s).join('') : '<div class="fx-sub" style="padding:10px 0">No match. Try a shorter word.</div>'); });
  if (parts[0]) setTimeout(() => openTerm(parts[0]), 150);
}

// ------------------------------------------------------------------------------------------ How it works
const ASSUMPTIONS = (plan, res) => { const A = plan.assumptions, m = res.meta, D0 = DEFAULT_ASSUMPTIONS; const asDef = (a, b) => (JSON.stringify(a) === JSON.stringify(b) ? 'def' : 'entered'); return [
  ['Retirement age', `${m.retireAge}`, null, '#/fire/inputs/profile', 'Sets how many years you save and how many years the money must last.', 'entered'],
  ['Planning horizon', `Age ${plan.profile.horizonAge}`, 'Age 90', '#/fire/inputs/profile', 'The age the money has to last until.', plan.profile.horizonAge === 90 ? 'def' : 'entered'],
  ['General inflation', `${A.inflation.general}%`, `${D0.inflation.general}%`, '#/fire/inputs/assumptions', 'How fast everyday prices rise.', asDef(A.inflation.general, D0.inflation.general)],
  ['Healthcare inflation', `${A.inflation.medical}%`, `${D0.inflation.medical}%`, '#/fire/inputs/assumptions', 'Medical costs usually rise faster than everyday prices.', asDef(A.inflation.medical, D0.inflation.medical)],
  ['Education inflation', `${A.inflation.education}%`, `${D0.inflation.education}%`, '#/fire/inputs/assumptions', 'School and college fees.', asDef(A.inflation.education, D0.inflation.education)],
  ['Equity return', `${A.returns.equity}%`, `${D0.returns.equity}%`, '#/fire/inputs/assumptions', 'Expected yearly growth of shares and equity funds.', asDef(A.returns.equity, D0.returns.equity)],
  ['Debt return', `${A.returns.debt}%`, `${D0.returns.debt}%`, '#/fire/inputs/assumptions', 'Expected yearly growth of debt funds.', asDef(A.returns.debt, D0.returns.debt)],
  ['EPF and NPS return', `${A.returns.epf}% and ${A.returns.nps}%`, `${D0.returns.epf}% and ${D0.returns.nps}%`, '#/fire/inputs/assumptions', 'Rule-based retirement accounts.', asDef([A.returns.epf, A.returns.nps], [D0.returns.epf, D0.returns.nps])],
  ['Retirement mix', Object.entries(A.retirementAllocation).filter(([, v]) => v > 0).map(([k, v]) => `${CLASS_INFO[k].short} ${v}%`).join(' · '), 'Equity 35 · Hybrid 20 · Debt 45', '#/fire/inputs/assumptions', 'How the corpus is invested while you spend it.', asDef(A.retirementAllocation, D0.retirementAllocation)],
  ['Safe withdrawal rate', `${A.swr}%`, `${D0.swr}%`, '#/fire/inputs/assumptions', 'The cross-check rule: yearly spending divided by this.', asDef(A.swr, D0.swr)],
  ['Tax on withdrawals', `${A.taxPct}% of the ${A.gainSharePct}% that is gain`, `${D0.taxPct}% of ${D0.gainSharePct}%`, '#/fire/inputs/assumptions', 'Extra added to the target for tax.', asDef([A.taxPct, A.gainSharePct], [D0.taxPct, D0.gainSharePct])],
  ['Income growth', `${A.salaryGrowth}%`, `${D0.salaryGrowth}%`, '#/fire/inputs/income', 'How fast your pay rises. Compare with inflation.', asDef(A.salaryGrowth, D0.salaryGrowth)],
  ['Healthcare reserve', `At least ${A.medicalMinSharePct ?? 8}% of spending, +${A.medicalAgeExtraPct ?? 1}% a year after 60`, '8% and 1%', '#/fire/inputs/assumptions', 'Makes sure healthcare is never left out of retirement costs.', asDef([A.medicalMinSharePct ?? 8, A.medicalAgeExtraPct ?? 1], [8, 1])],
  ['Yearly-costs cushion', `${A.unrecordedCostsPct || 0}%`, '0%', '#/fire/inputs/assumptions', 'Insurance renewals, trips and gifts missing from a normal month.', asDef(A.unrecordedCostsPct || 0, 0)],
  ['Family-held funds', A.includeFamilyFunds ? 'Counted' : 'Left out', 'Counted', '#/fire/inputs/assumptions', 'Investments in a relative\'s name.', asDef(A.includeFamilyFunds, true)],
  ['Chance-of-success bar', `${A.successThreshold ?? 80}%`, '80%', '#/fire/inputs/assumptions', 'What counts as safe in the stress test.', asDef(A.successThreshold ?? 80, 80)],
]; };

export function how(root, { parts }) {
  const plan = X.getPlan(), res = X.run(), mc = FS.fs.mc, A = plan.assumptions, m = res.meta, g = res.gap, t = res.target, today = X.today();
  const sens = sensitivity(plan, { today }), sc = compareScenarios(plan, { today });
  const ledger = ASSUMPTIONS(plan, res);
  const valueOf = { 'Monthly saving ±20%': [`${inrC(m.sipNow)} a month`, '#/fire/inputs/assets', 'Your SIPs'], 'Retirement age ±2 years': [`Age ${m.retireAge}`, '#/fire/inputs/profile', 'When you stop working'], 'Equity return ±2 points': [`${A.returns.equity}% a year`, '#/fire/inputs/assumptions', 'How fast shares grow'], 'Retirement spending ±10%': [`${inrC(t.monthlyToday)} a month`, '#/fire/inputs/spending', 'What life costs after retirement'], 'Inflation ±1 point': [`${A.inflation.general}% a year`, '#/fire/inputs/assumptions', 'How fast prices rise'], 'Income growth ±2 points': [`${A.salaryGrowth}% a year`, '#/fire/inputs/income', 'How fast your pay grows'] };
  const top = sens.slice(0, 3).map((s) => s.label.replace(/ ±.*/, '').toLowerCase());
  const changed = ledger.filter((l) => l[5] === 'entered').length;
  const step = (n, icon, title, body, to, linkText) => h`<div class="fx-story"><span class="fx-num">${n}</span><div class="grow"><div class="fx-q">${icon} ${title}</div><p class="fx-say">${body}</p>${to ? h`<a class="fx-link" href="${to}">${linkText} →</a>` : ''}</div></div>`;
  const maxSwing = Math.max(...sens.map((s) => s.swing), 1);
  html(root, h`<div class="fx">${head({ kicker: 'GUIDE', title: 'How it works', back: '#/fire/learn', sub: 'The whole planner, end to end, using your numbers.' })}
    <div class="fx-card glow"><div class="fx-lbl">THE BIG PICTURE</div>
      <p class="fx-say" style="font-size:16px;margin-top:8px">Retirement is a <b>road trip with no petrol stations at the destination</b>. The planner answers one question: <b>will the tank be full enough to reach the end of the road?</b></p>
      <div class="fx-grid2" style="margin-top:10px">${tile('THE TANK YOU NEED', inrC(g.target), 'Target corpus')}${tile('THE TANK YOU WILL HAVE', inrC(g.projected), 'Projected corpus')}</div>
      <div class="col" style="gap:8px;margin-top:12px">${[['⛽', 'Topping up each month', `Your SIPs: ${inrC(m.sipNow)} a month`], ['🕳️', 'Leaks', `Loans and costs: ${inrC(m.emiNow)} of EMIs a month`], ['🌧️', 'Weather', 'Markets and prices: tested thousands of times'], ['🧭', 'Route changes', 'What-ifs: a second income, a later start, higher costs']].map(([i, a, b]) => h`<div class="fx-row" style="gap:12px;align-items:flex-start"><span style="font-size:20px">${i}</span><span><b>${a}</b><div class="fx-sub">${b}</div></span></div>`)}</div></div>

    <div class="fx-lbl" style="margin:4px 0 -4px">FROM YOUR NUMBERS TO YOUR ANSWER</div>
    <div class="fx-card"><div class="col" style="gap:20px">
      ${step(1, '🗂️', 'You tell it the facts', `${plan.profile.people.length} people, ${plan.incomes.length} income source${plan.incomes.length === 1 ? '' : 's'}, ${plan.holdings.length} holdings, ${plan.loans.length} loan${plan.loans.length === 1 ? '' : 's'}, ${plan.events.length} life events and ${plan.goals.filter((x) => !x.archived).length} goals. Where it can, it reads your real spending and balances from the budget side of the app.`, '#/fire/inputs', 'Open Inputs')}
      ${step(2, '🎚️', 'It applies assumptions about the world', `Prices rise ${A.inflation.general}% a year (healthcare ${A.inflation.medical}%), shares grow ${A.returns.equity}%, you take no more than ${A.swr}% a year, and tax takes ${A.taxPct}% of gains. ${changed} of ${ledger.length} are set by you; the rest are sensible defaults.`, '#/fire/how/assumptions', 'See every assumption')}
      ${step(3, '⚙️', 'It runs your life year by year', `From ${m.baseYear} to ${res.model.endYear}: pay comes in, spending and EMIs go out, SIPs top up your investments, each investment grows at its own pace, and events like the baby or the house hit on their dates. Everything is counted in today's money so numbers stay familiar.`, '#/fire/detail/projection', 'See the year-by-year path')}
      ${step(4, '✅', 'It checks the answer three ways', `A straight-line projection says you are ${pc(g.pct)} funded. A stress test of ${mc ? mc.paths.toLocaleString('en-IN') : '10,000'} random futures says ${mc ? `${Math.round(mc.success * 100)}% last to age ${mc.horizonAge}` : 'it is still running'}. And ${sc.length} what-if worlds show the earliest age you could stop in each.`, '#/fire', 'See all three on the Overview')}
      ${step(5, '🎯', 'It tells you the gap and how to close it', g.amount > 0 ? `You are ${inr(g.amount)} short. Save more, spend less, earn more or retire later: each is worked out on its own.` : `You are ${inr(-g.amount)} ahead. The levers show how much earlier you could stop.`, '#/fire/detail/gap', 'Open the levers')}
      ${step(6, '🔄', 'It stays alive as your life changes', `Every change you make recalculates at once. Live tracking compares real months with the plan, and Check-in saves dated snapshots so you can see whether you are moving closer.`, '#/fire/live', 'Open Live')}
    </div></div>

    <div class="fx-lbl" id="assumptions" style="margin:6px 0 -4px">KEY ASSUMPTIONS FOR YOU</div>
    <div class="fx-card"><p class="fx-say">Because your goal is to retire at <b>${m.retireAge}</b> on <b>${inrC(t.monthlyToday)}</b> a month, the assumptions that matter most to <i>your</i> answer are <b>${top.join(', ')}</b>. This list re-sorts itself whenever you change your numbers.</p>
      <div class="col" style="gap:12px;margin-top:6px">${sens.map((s, i) => { const [val, to, what] = valueOf[s.label] || ['', '#/fire/inputs', '']; return h`<a href="${to}" class="fx-tile" style="display:block"><div class="fx-row fx-between" style="gap:8px;align-items:flex-start"><div class="grow" style="min-width:0"><b>${i + 1}. ${s.label.replace(/ ±.*/, '')}</b><div class="fx-sub">${what} · now ${val}</div></div><b class="${i < 3 ? 'warn' : ''}" style="text-align:right">±${inrC(s.swing / 2)}</b></div>${bar(s.swing / maxSwing, i < 3 ? 'var(--fx-warn)' : 'var(--fx)')}<div class="fx-sub" style="margin-top:6px">${s.label.includes('±') ? `A ${s.label.split('±')[1]} change moves your gap by about ${inrC(s.swing / 2)} either way.` : ''}</div></a>`; })}</div></div>

    <div class="fx-card"><div class="fx-ch"><h3>Every assumption</h3><span class="fx-chip ${changed ? 'pur' : ''}">${changed} set by you</span></div>
      <div class="fx-list">${ledger.map(([n, val, def, to, why, src]) => h`<a class="fx-li" href="${to}" style="align-items:flex-start;padding:12px 0"><span class="grow" style="min-width:0"><b>${n}</b><div class="fx-sub" style="margin-top:2px">${why}</div>${src === 'entered' && def ? h`<div class="fx-sub">Default: ${def}</div>` : ''}</span><span style="text-align:right;max-width:46%"><b style="${src === 'entered' ? 'color:var(--fx2)' : ''}">${val}</b><div style="margin-top:4px">${srcChip(src === 'def' ? 'def' : 'entered')}</div></span></a>`)}</div></div>
    ${note('ⓘ', 'Estimates from the assumptions above, not financial, tax or legal advice. Change an assumption and every screen updates.', 'purple')}
    ${fxNav('overview')}</div>`);
  if (parts[0] === 'assumptions') setTimeout(() => document.getElementById('assumptions')?.scrollIntoView({ block: 'start' }), 80);
  void chip; void inrF; void holdingValue;
}
