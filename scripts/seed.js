// Demo data mirroring the reference screens. Usage: node scripts/seed.js  (creates demo@duet.local / demo1234 and partner@duet.local / demo1234)
import { createApp } from '../server.js';
import * as D from '../lib/dates.js';
const PORT = 3999;
const app = createApp(); await new Promise((r) => app.server.listen(PORT, '127.0.0.1', r));
const base = `http://127.0.0.1:${PORT}`;
const client = () => { let cookie = ''; return async (m, p, b) => { const r = await fetch(base + p, { method: m, headers: { 'Content-Type': 'application/json', cookie }, body: b ? JSON.stringify(b) : undefined });
  const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]; const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(p + ' ' + JSON.stringify(j)); return j; }; };
const a = client(), b = client();
await a('POST', '/api/auth/signup', { name: 'Tejas Gajjar', email: 'demo@duet.local', password: 'demo1234', tz: 'UTC' });
const boot = await a('GET', '/api/bootstrap');
await b('POST', '/api/auth/signup', { name: 'Alex Rivera', email: 'partner@duet.local', password: 'demo1234', invite: boot.space.invite_code });
const today = boot.today, cat = (n) => boot.categories.find((c) => c.name === n).id;
const mk = async (c, n, t, color, bal) => (await c('POST', '/api/wallets', { name: n, type: t, color, initial_cents: bal })).id;
const main = await mk(a, 'Main Checking', 'bank', '#1DDB97', 0), cash = await mk(a, 'Pocket Cash', 'cash', '#F5A623', 18550), sav = await mk(a, 'Rainy Day Fund', 'savings', '#3B82F6', 820000), home = await mk(a, 'Home Shared', 'shared', '#7C5FE6', 62000);
const tx = (c, o) => c('POST', '/api/transactions', { type: 'expense', time: '19:45', status: 'cleared', ...o });
const day = (n) => D.addDays(today, -n);
await tx(a, { type: 'income', amount_cents: 455000, wallet_id: main, category_id: cat('Salary'), date: D.monthStart(today), note: 'Salary' });
await tx(a, { amount_cents: 62000, wallet_id: main, category_id: cat('Bills & Utilities'), date: D.monthStart(today), note: 'Electricity Bill', recurring: 'monthly' });
await tx(b, { amount_cents: 53000, wallet_id: main, category_id: cat('Bills & Utilities'), date: D.addDays(D.monthStart(today), 4), note: 'Phone Plan' });
await tx(a, { amount_cents: 5490, wallet_id: main, category_id: cat('Food & Drinks'), date: today, note: 'Dinner & drinks with Alex', tags: ['dinner', 'weekend'] });
await tx(b, { amount_cents: 4500, wallet_id: main, category_id: cat('Transport'), date: today, note: 'Metro card reload', tags: ['transport'] });
await tx(b, { amount_cents: 8420, wallet_id: main, category_id: cat('Groceries'), date: day(1), note: 'Weekly organic grocery haul', tags: ['groceries'] });
await tx(a, { amount_cents: 3250, wallet_id: main, category_id: cat('Food & Drinks'), date: day(36), note: 'Cafe Oasis' });
await tx(a, { amount_cents: 2800, wallet_id: main, category_id: cat('Food & Drinks'), date: day(47), note: 'Thai Kitchen' });
await tx(a, { amount_cents: 2400, wallet_id: cash, category_id: cat('Food & Drinks'), date: day(2), note: 'Street tacos' });
for (let m = 1; m <= 3; m++) { const d = D.addMonths(D.monthStart(today), -m);
  await tx(a, { type: 'income', amount_cents: 455000 + m * 9000, wallet_id: main, category_id: cat('Salary'), date: d, note: 'Salary' });
  await tx(a, { amount_cents: 112000 + m * 4000, wallet_id: main, category_id: cat('Bills & Utilities'), date: D.addDays(d, 3), note: 'Bills' });
  await tx(b, { amount_cents: 31000 + m * 2500, wallet_id: main, category_id: cat('Groceries'), date: D.addDays(d, 9), note: 'Groceries' });
  await tx(a, { amount_cents: 24000 - m * 1500, wallet_id: main, category_id: cat('Food & Drinks'), date: D.addDays(d, 12), note: 'Eating out' }); }
for (const [c, amt] of [['Bills & Utilities', 130000], ['Food & Drinks', 45000], ['Groceries', 40000], ['Transport', 15000], ['Entertainment', 10000]]) await a('POST', '/api/budgets', { category_id: cat(c), amount_cents: amt, start_date: D.monthStart(today), rollover: c === 'Food & Drinks' });
for (const [s, n, k, q, cost, price] of [['AAPL', 'Apple Inc.', 'stock', 12, 1700000, 162000], ['BTC', 'Bitcoin', 'crypto', 0.1481, 1100000, 9780000], ['VOO', 'Vanguard S&P 500', 'etf', 15, 900000, 64380], ['ETH', 'Ethereum', 'crypto', 1.52, 350000, 250000], ['USB', 'US Bonds 10yr', 'bond', 1, 92700, 92700]]) {
  const r = await a('POST', '/api/investments', { symbol: s, name: n, kind: k, quantity: q, cost_cents: cost, price_cents: price });
  if (s === 'AAPL') await a('PATCH', '/api/investments/' + r.id, { price_cents: Math.round(price * 1.021) }); }
console.log('Seeded. Log in as demo@duet.local or partner@duet.local (password demo1234). Invite code:', boot.space.invite_code);
app.close(); process.exit(0);
