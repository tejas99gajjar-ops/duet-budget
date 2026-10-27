// Small actions shared by several screens: retirement-age picker, money basis, method picker, ⋮ menu, copy summary.
import { h, raw, sheet, toast, errToast } from './ui.js';
import { IC, openNumber, openInfo } from './ui.js';
import * as FS from './store.js';
import * as X from './ctx.js';
import { inr, inrC, pc } from './format.js';
import { birthYearOf } from './engine.js';

export function pickRetireAge() {
  const plan = X.getPlan(), res = X.run(), age = res.meta.retireAge, now = res.meta.ageNow;
  openNumber({ title: 'Retirement age', sub: 'The age you want to stop depending on a salary', value: age, min: Math.max(30, now + 1), max: 70, suffix: '',
    help: (n) => `That is ${n - now} years from now, in ${res.meta.birth + n}. Every result updates when you set it.`,
    onSave: (n) => { FS.edit('profile', (p) => { p.people[0].retireAge = n; return p; }); FS.edit('settings', (s) => { s.retireAge = null; return s; }); } });
  void plan;
}
export const toggleBasis = () => FS.edit('settings', (s) => { s.basis = s.basis === 'nominal' ? 'today' : 'nominal'; return s; }, { immediate: true });

export const METHODS = { deterministic: ['Deterministic', 'DETERM.', 'Exact year-by-year projection on fixed assumptions'], montecarlo: ['Monte Carlo', 'MONTE CARLO', 'Probability your money lasts when returns are random'], scenarios: ['Scenarios', 'SCENARIOS', 'The same plan under different life choices'] };
export function openMethodPicker() {
  const cur = X.getPlan().settings.headlineMethod || 'deterministic';
  const s = sheet(h`<div class="fx-sheet-h"><div><h1>Headline method</h1><div class="fx-sub">Which method drives the status on the Overview</div></div><button class="iconbtn" data-act="close" aria-label="Close">${IC.close}</button></div>
    <div class="fx-list">${Object.entries(METHODS).map(([id, [name, , desc]]) => h`<button class="fx-li" data-act="pick" data-id="${id}"><span class="fx-ico">${id === 'deterministic' ? '📐' : id === 'montecarlo' ? '🎲' : '🔀'}</span><span class="grow"><b>${name}</b><div class="fx-sub">${desc}</div></span><span class="fx-chip ${id === cur ? 'pur' : ''}">${id === cur ? 'Selected' : 'Use'}</span></button>`)}</div>`,
    { click: { pick: (el) => { FS.edit('settings', (st) => { st.headlineMethod = el.dataset.id; return st; }, { immediate: true }); s.close(); } } });
}

export function openMenu() {
  const items = [['#/fire/checkin', '📅', 'Check-in & snapshots', 'Compare the plan with real progress'], ['#/fire/settings', '⚙️', 'Plan settings', 'Name, sync, export, import, tags'], ['#/fire/detail/calc', '🧮', 'Show detailed calculation', 'Every step with your numbers'],
    ['copy', '📋', 'Copy plan summary', 'Plain text you can paste anywhere'], ['#/fire/wizard', '🧭', 'Rerun setup', 'Walk through the setup again']];
  const s = sheet(h`<div class="fx-sheet-h"><h1>More</h1><button class="iconbtn" data-act="close" aria-label="Close">${IC.close}</button></div><div class="fx-list">${items.map(([href, ic, t, d]) => h`<button class="fx-li" data-act="go" data-to="${href}"><span class="fx-ico">${ic}</span><span class="grow"><b>${t}</b><div class="fx-sub">${d}</div></span>${IC.chev}</button>`)}</div>`,
    { click: { go: (el) => { s.close(); if (el.dataset.to === 'copy') copySummary(); else location.hash = el.dataset.to; } } });
}

export function summaryText() {
  const plan = X.getPlan(), res = X.run(), g = res.gap, mc = X.mcFresh(), c = X.close();
  const L = [`${plan.name}`, `Retire at ${res.meta.retireAge} (${res.meta.retireYear}), ${res.meta.yearsToRet} years away. Amounts in today's rupees.`, '',
    `Target corpus: ${inr(g.target)}`, `Projected corpus: ${inr(g.projected)} (${pc(g.pct)} funded)`, `${g.amount > 0 ? 'Shortfall' : 'Surplus'}: ${inr(Math.abs(g.amount))}`];
  if (g.amount > 0) { if (c.extraMonthly) L.push(`To close it: save ${inr(c.extraMonthly)} more each month, or retire at ${c.laterAge ?? '60+'}.`); }
  if (mc) L.push(`Monte Carlo (${mc.paths.toLocaleString('en-IN')} runs): ${pc(mc.success)} chance money lasts to age ${mc.horizonAge}.`);
  L.push('', 'Goals:'); for (const x of res.goals) L.push(`- ${x.name}: needed ${inr(x.needed)}, funded ${inr(x.funded)} (${pc(x.pct)})${x.date ? `, ${x.date.slice(0, 4)}` : ''}`);
  const A = plan.assumptions; L.push('', `Assumptions: inflation ${A.inflation.general}%, equity ${A.returns.equity}%, safe withdrawal ${A.swr}%, life expectancy ${plan.profile.horizonAge}.`, 'Estimates from your assumptions. Not financial, tax or legal advice.');
  return L.join('\n');
}
export async function copySummary() {
  const text = summaryText();
  try { await navigator.clipboard.writeText(text); toast('Plan summary copied'); }
  catch { openInfo('Copy plan summary', h`<textarea class="fx-in" rows="12" readonly style="font-size:13px">${text}</textarea>`, [['Done', null]]); }
}
export { raw, errToast, inrC, birthYearOf };
