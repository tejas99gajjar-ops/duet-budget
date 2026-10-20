// The ported browser-side maths must give the same answers as the original SQLite server for identical data.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
const { createDb, pgBackend } = await import('./pg-node.js');
const db = await createDb();
globalThis.window = { dispatchEvent() {}, addEventListener() {} };
const S = await import('../public/js/store.js');
const { request } = await import('../public/js/local-api.js');
const D = await import('../public/js/dates.js');
const { createApp } = await import('../server.js');

const be = pgBackend(db, 'a@x.io', 'Tejas'); S.configure(be); S.state.user = await be.auth.signUp();
await be.rpc('create_space', { p_name: 'T', p_user_name: 'Tejas', p_tz: 'UTC' }); await S.init();
const old = createApp({ dbFile: ':memory:' }); await new Promise((r) => old.server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${old.server.address().port}`; let cookie = '';
const oldApi = async (m, p, b) => { const r = await fetch(base + '/api' + p, { method: m, headers: { 'Content-Type': 'application/json', cookie }, body: b ? JSON.stringify(b) : undefined }); const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0]; return r.json(); };
await oldApi('POST', '/auth/signup', { name: 'Tejas', email: 'a@x.io', password: 'password1', tz: 'UTC' });
const nu = (m, p, b) => request(m, p, b);
const both = async (m, p, b, fix) => { const o = await oldApi(m, p, b && (typeof b === 'function' ? b('old') : b)); const n = await nu(m, p, b && (typeof b === 'function' ? b('new') : b)); return [o, n]; };

const today = (await nu('GET', '/bootstrap')).today;
const catsNew = Object.fromEntries((await nu('GET', '/bootstrap')).categories.map((c) => [c.name, c.id])), catsOld = Object.fromEntries((await oldApi('GET', '/bootstrap')).categories.map((c) => [c.name, c.id]));
const cat = (n) => (side) => (side === 'old' ? catsOld : catsNew)[n];
// same ops on both sides
const ops = async () => {
  const w1 = await both('POST', '/wallets', { name: 'Main', type: 'bank', initial_cents: 300000 }), w2 = await both('POST', '/wallets', { name: 'Cash', type: 'cash', initial_cents: 18550 });
  const W = (i) => (side) => (side === 'old' ? w1[0].id : w1[1].id); void W; const wid = (pair) => (side) => (side === 'old' ? pair[0].id : pair[1].id);
  const tx = (o) => both('POST', '/transactions', (side) => ({ ...o, wallet_id: wid(w1)(side), category_id: o.cat ? cat(o.cat)(side) : undefined, cat: undefined, to_wallet_id: o.to ? wid(w2)(side) : undefined, to: undefined }));
  for (let m = 0; m <= 4; m++) { const d = D.addMonths(D.monthStart(today), -m);
    await tx({ type: 'income', amount_cents: 455000 + m * 5000, cat: 'Salary', date: d, note: 'Salary' });
    await tx({ type: 'expense', amount_cents: 62000 + m * 3000, cat: 'Bills & Utilities', date: D.addDays(d, 1), note: 'Electricity', tags: ['bills'] });
    await tx({ type: 'expense', amount_cents: 8420 + m * 100, cat: 'Groceries', date: D.addDays(d, 8), note: 'Groceries' });
    await tx({ type: 'expense', amount_cents: 5490, cat: 'Food & Drinks', date: D.addDays(d, 11), note: 'Dinner' }); }
  await tx({ type: 'expense', amount_cents: 4500, cat: 'Transport', date: today, note: 'Metro' }); await tx({ type: 'transfer', amount_cents: 20000, to: true, date: D.addDays(today, -2) });
  await tx({ type: 'expense', amount_cents: 1999, cat: 'Entertainment', date: D.addDays(today, -3), note: 'Movie' });
  for (const [c, a, p, r] of [['Bills & Utilities', 130000, 'monthly', 0], ['Food & Drinks', 45000, 'monthly', 1], ['Groceries', 40000, 'monthly', 0], ['Transport', 5000, 'weekly', 1]])
    await both('POST', '/budgets', (side) => ({ category_id: cat(c)(side), amount_cents: a, period: p, rollover: !!r, start_date: D.addMonths(D.monthStart(today), -3) }));
  await both('PATCH', '/space', { week_start: 3 });
  const inv = await both('POST', '/investments', { symbol: 'VOO', name: 'Vanguard', kind: 'etf', quantity: 15, cost_cents: 900000, price_cents: 64380 }); await both('PATCH', `/investments/${inv[0].id}`, { price_cents: 65000 }, null);
};
const strip = (v) => JSON.parse(JSON.stringify(v, (k, x) => (['user_id', 'by', 'created_by', 'id', 'category_id', 'pending_sync', 'price_updated_at', 'user_name', 'to_wallet_name'].includes(k) ? undefined : x)));
test('summary, budgets, analytics and portfolio match the original server', async () => {
  await ops();
  const cmp = async (path) => { const [o, n] = await both('GET', path); assert.deepEqual(strip(n), strip(o), path); };
  await cmp('/summary'); await cmp('/budgets'); await cmp('/budgets?mode=all'); await cmp('/portfolio');
  for (const period of ['day', 'week', 'month', 'year']) for (const kind of ['expense', 'income', 'net']) await cmp(`/analytics?period=${period}&kind=${kind}`);
  await cmp(`/analytics?period=month&date=${D.addMonths(today, -2)}`);
  const [o, n] = await both('GET', '/bootstrap'); assert.deepEqual(n.wallets.map((w) => w.balance_cents), o.wallets.map((w) => w.balance_cents));
});
after(() => old.close());
