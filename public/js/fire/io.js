// Export and import of the plan: JSON (round trip), CSV (spreadsheet), Markdown (readable report) and print.
import * as X from './ctx.js';
import * as FS from './store.js';
import { normalizePlan } from './defaults.js';
import { holdingValue } from './engine.js';
import { inr, inrC, pc } from './format.js';
import { summaryText } from './actions.js';

const SECTIONS = FS.SECTIONS;
export function download(name, text, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` })), a = document.createElement('a');
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const slug = (s) => String(s || 'plan').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'plan';
export const planFile = (plan, ext) => `fire-${slug(plan.name)}-${X.today()}.${ext}`;

export const toJSON = (plan) => JSON.stringify({ app: 'duet-fire', version: 1, exportedAt: new Date().toISOString(), plan: { name: plan.name, ...Object.fromEntries(SECTIONS.map((s) => [s, plan[s]])) } }, null, 2);

/** Parses a JSON export (or a bare plan object) into a normalised plan, or throws a readable error. */
export function parseJSON(text) {
  let o; try { o = JSON.parse(text); } catch { throw new Error('That file is not valid JSON.'); }
  const p = o?.plan || o; if (!p || typeof p !== 'object' || !p.profile || !Array.isArray(p.profile.people) || !p.profile.people.length) throw new Error('This does not look like a FIRE plan export.');
  for (const k of ['incomes', 'holdings', 'loans', 'insurance', 'events', 'goals']) if (p[k] != null && !Array.isArray(p[k])) throw new Error(`"${k}" should be a list.`);
  return normalizePlan(p);
}

const q = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const table = (title, cols, rows) => [`# ${title}`, cols.join(','), ...rows.map((r) => r.map(q).join(',')), ''].join('\n');
export function toCSV(plan) {
  const people = plan.profile.people, name = (id) => people.find((p) => p.id === id)?.name || '';
  return [
    table('Income', ['name', 'owner', 'type', 'source', 'monthly_take_home', 'growth_pct', 'until_year'], plan.incomes.map((i) => [i.label, name(i.person), i.type, i.sourceTag, i.takeHome, i.growthPct, i.untilYear])),
    table('Spending', ['category', 'group', 'monthly'], (plan.spending.categories || []).map((c) => [c.name, c.group, c.monthly])),
    table('Holdings', ['name', 'type', 'asset_class', 'owner', 'current_value', 'invested', 'units', 'price', 'sip_per_month'], plan.holdings.map((h) => [h.name, h.kind, h.assetClass, name(h.owner), holdingValue(h), h.invested, h.units, h.price, (h.sips || []).filter((s) => s.status !== 'paused' && s.status !== 'stopped').reduce((s, x) => s + (Number(x.amount) || 0), 0)])),
    table('Loans', ['name', 'type', 'outstanding', 'rate_pct', 'emi', 'status'], plan.loans.map((l) => [l.name, l.tag, l.outstanding ?? l.principal, l.ratePct, l.emi, l.status])),
    table('Insurance', ['name', 'type', 'cover', 'premium', 'frequency'], plan.insurance.map((i) => [i.name, i.kind, i.cover, i.premium, i.frequency])),
    table('Events', ['name', 'type', 'date', 'cost', 'annual_cost', 'years'], plan.events.map((e) => [e.name, e.kind, e.date, e.cost, e.annualCost, e.durationYears])),
    table('Goals', ['name', 'type', 'target', 'date', 'monthly_allocation', 'priority'], plan.goals.map((g) => [g.name, g.kind, g.target, g.date, g.monthlyAlloc, g.priority])),
  ].join('\n');
}

export function toMarkdown(plan) {
  const res = X.run(), people = plan.profile.people, row = (a) => `| ${a.join(' | ')} |`;
  const L = [`# ${plan.name}`, '', '```', summaryText(), '```', '', '## People', row(['Name', 'Born', 'Retire at']), row(['---', '---', '---']), ...people.map((p) => row([p.name, p.dob || p.birthYear, p.retireAge ?? '—'])), '',
    '## Income (per month)', row(['Source', 'Take-home']), row(['---', '---']), ...plan.incomes.map((i) => row([i.label, inr(i.takeHome)])), '',
    '## Holdings', row(['Name', 'Class', 'Value', 'SIP/mo']), row(['---', '---', '---', '---']), ...plan.holdings.map((h) => row([h.name, h.assetClass, inr(holdingValue(h)), inr((h.sips || []).filter((s) => s.status === 'active' || !s.status).reduce((s, x) => s + (Number(x.amount) || 0), 0))])), '',
    '## Loans', row(['Loan', 'Outstanding', 'Rate', 'EMI']), row(['---', '---', '---', '---']), ...plan.loans.map((l) => row([l.name, inr(l.outstanding ?? l.principal), `${l.ratePct}%`, inr(l.emi)])), '',
    '## Goals', row(['Goal', 'Needed', 'Funded', '%']), row(['---', '---', '---', '---']), ...res.goals.map((g) => row([g.name, inrC(g.needed), inrC(g.funded), pc(g.pct)])), ''];
  return L.join('\n');
}

export function printPlan() {
  const plan = X.getPlan(), md = toMarkdown(plan).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const w = document.createElement('div'); w.id = 'fx-print'; w.innerHTML = `<pre>${md}</pre>`; document.body.append(w);
  const st = document.createElement('style'); st.textContent = '@media print{body>*:not(#fx-print){display:none!important}#fx-print{display:block!important;color:#000;background:#fff;font:12px/1.5 monospace;white-space:pre-wrap}} #fx-print{display:none}'; document.head.append(st);
  const done = () => { w.remove(); st.remove(); window.removeEventListener('afterprint', done); }; window.addEventListener('afterprint', done); setTimeout(() => window.print(), 50); setTimeout(done, 60000);
}

/** Reads a File chosen by the person. */
export const readFile = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error('Could not read the file')); r.readAsText(file); });
