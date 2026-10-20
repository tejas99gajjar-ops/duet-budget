import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
process.env.MAX_MEMBERS = '3';
const { createApp } = await import('../server.js');
const D = await import('../lib/dates.js');

let app, base;
before(async () => { app = createApp({ dbFile: ':memory:' }); await new Promise((r) => app.server.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${app.server.address().port}`; });
after(() => app.close());

const client = () => {
  let cookie = '';
  return async (method, path, body) => {
    const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', cookie }, body: body ? JSON.stringify(body) : undefined });
    const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const ct = res.headers.get('content-type') || '';
    return { status: res.status, body: ct.includes('json') ? await res.json() : await res.text() };
  };
};
const a = client(), b = client();
let walletId, foodId, groceryId, today;

test('signup creates a shared account and a partner can join with the invite code', async () => {
  let r = await a('POST', '/api/auth/signup', { name: 'Tejas', email: 'a@x.io', password: 'password1', tz: 'UTC' });
  assert.equal(r.status, 201);
  r = await a('GET', '/api/bootstrap'); today = r.body.today;
  const code = r.body.space.invite_code; assert.ok(code);
  assert.equal((await b('POST', '/api/auth/signup', { name: 'X', email: 'c@x.io', password: 'password1', invite: 'NOPE' })).status, 400);
  r = await b('POST', '/api/auth/signup', { name: 'Alex', email: 'b@x.io', password: 'password1', invite: code });
  assert.equal(r.status, 201);
  r = await b('GET', '/api/bootstrap'); assert.equal(r.body.space.members.length, 2);
  r = await client()('POST', '/api/auth/signup', { name: 'Third', email: 'd@x.io', password: 'password1', invite: code });
  assert.equal(r.status, 201, 'a third person can join (MAX_MEMBERS=3)');
  r = await client()('POST', '/api/auth/signup', { name: 'Fourth', email: 'e@x.io', password: 'password1', invite: code });
  assert.equal(r.status, 400, 'account is full at MAX_MEMBERS');
});

test('auth is required and bad passwords rejected', async () => {
  assert.equal((await client()('GET', '/api/bootstrap')).status, 401);
  assert.equal((await client()('POST', '/api/auth/login', { email: 'a@x.io', password: 'wrong-pass' })).status, 401);
  assert.equal((await client()('POST', '/api/auth/signup', { name: 'S', email: 's@x.io', password: 'short' })).status, 400);
});

test('wallets, balances and transfers (both partners see the same data)', async () => {
  let r = await a('POST', '/api/wallets', { name: 'Main Checking', type: 'bank', initial_cents: 300000 }); walletId = r.body.id;
  const w2 = (await b('POST', '/api/wallets', { name: 'Savings', type: 'savings', initial_cents: 0 })).body.id;
  const cats = (await a('GET', '/api/bootstrap')).body.categories;
  foodId = cats.find((c) => c.name === 'Food & Drinks').id; groceryId = cats.find((c) => c.name === 'Groceries').id;
  await a('POST', '/api/transactions', { type: 'income', amount_cents: 455000, wallet_id: walletId, category_id: cats.find((c) => c.name === 'Salary').id, date: today });
  await b('POST', '/api/transactions', { type: 'expense', amount_cents: 5490, wallet_id: walletId, category_id: foodId, date: today, note: 'Dinner', tags: ['#dinner'] });
  await a('POST', '/api/transactions', { type: 'transfer', amount_cents: 100000, wallet_id: walletId, to_wallet_id: w2, date: today });
  r = await b('GET', '/api/bootstrap');
  const bal = Object.fromEntries(r.body.wallets.map((w) => [w.name, w.balance_cents]));
  assert.equal(bal['Main Checking'], 300000 + 455000 - 5490 - 100000);
  assert.equal(bal['Savings'], 100000);
  assert.equal((await a('POST', '/api/transactions', { type: 'transfer', amount_cents: 1, wallet_id: walletId, to_wallet_id: walletId, date: today })).status, 400);
  assert.equal((await a('POST', '/api/transactions', { type: 'expense', amount_cents: 0, wallet_id: walletId, date: today })).status, 400);
  assert.equal((await a('POST', '/api/transactions', { type: 'expense', amount_cents: 5, wallet_id: walletId, category_id: cats.find((c) => c.name === 'Salary').id, date: today })).status, 400, 'income category on expense');
});

test('budget pacing uses the reference formula (remaining / days left)', async () => {
  const start = D.monthStart(today);
  await a('POST', '/api/budgets', { category_id: foodId, amount_cents: 45000, period: 'monthly', start_date: start });
  assert.equal((await a('POST', '/api/budgets', { category_id: foodId, amount_cents: 1 })).status, 400, 'duplicate budget');
  const r = await b('GET', '/api/budgets');
  const food = r.body.items[0];
  assert.equal(food.spent_cents, 5490); assert.equal(food.remaining_cents, 45000 - 5490);
  const expectedLeft = Math.max(1, D.diffDays(today, D.monthEnd(today)));
  assert.equal(food.days_left, expectedLeft);
  assert.equal(food.safe_per_day_cents, Math.round((45000 - 5490) / expectedLeft));
  assert.equal(r.body.overall.limit_cents, 45000); assert.equal(r.body.overall.status, 'ok');
  await b('POST', '/api/transactions', { type: 'expense', amount_cents: 40000, wallet_id: walletId, category_id: foodId, date: today });
  assert.equal((await a('GET', '/api/budgets')).body.items[0].status, 'over');
});

test('summary: savings rate and month totals', async () => {
  const r = (await a('GET', '/api/summary')).body;
  assert.equal(r.income_cents, 455000); assert.equal(r.expense_cents, 5490 + 40000);
  assert.ok(Math.abs(r.savings_rate - (455000 - 45490) / 455000) < 1e-9);
  assert.equal(r.net_worth_cents, 300000 + 455000 - 45490);
  assert.ok(r.insights.some((i) => i.text.includes('Food')), 'rule-based tip names the hot budget');
});

test('analytics breaks spending down by category and by person', async () => {
  const r = (await a('GET', '/api/analytics?kind=expense')).body;
  assert.equal(r.total_cents, 45490); assert.equal(r.by_category[0].name, 'Food & Drinks');
  assert.equal(r.by_category[0].share, 1); assert.equal(r.items[0].amount_cents, 40000, 'all expenses, largest first');
  assert.ok(r.items.every((it, i, a) => !i || a[i - 1].amount_cents >= it.amount_cents)); assert.equal(r.items.at(-1).cumulative_share, 1);
  assert.equal(r.by_member.find((m) => m.name === 'Alex').cents, 45490); assert.equal(r.by_member.find((m) => m.name === 'Tejas').cents, 0);
  assert.equal(r.trend.length, 7, '6 months + projection'); assert.equal(r.trend.at(-1).projected, true);
});

test('filtering, search, edit and delete', async () => {
  let r = await a('GET', '/api/transactions?q=dinner'); assert.equal(r.body.items.length, 1);
  r = await a('GET', '/api/transactions?q=%25'); assert.equal(r.body.items.length, 0, 'LIKE wildcards are escaped');
  const id = r.body.items[0]?.id ?? (await a('GET', '/api/transactions?q=dinner')).body.items[0].id;
  assert.equal((await a('PATCH', `/api/transactions/${id}`, { amount_cents: 6000 })).status, 200);
  const d = (await a('GET', `/api/transactions/${id}`)).body; assert.equal(d.amount_cents, 6000); assert.ok(d.budget_impact);
  assert.equal((await a('DELETE', `/api/transactions/${id}`)).status, 200);
  assert.equal((await a('GET', `/api/transactions/${id}`)).status, 404);
});

test('recurring transactions are materialised when due', async () => {
  const past = D.addDays(today, -40);
  await a('POST', '/api/transactions', { type: 'expense', amount_cents: 999, wallet_id: walletId, category_id: groceryId, date: past, note: 'Sub', recurring: 'monthly' });
  await a('GET', '/api/summary');
  const r = await a('GET', '/api/transactions?q=Sub'); assert.equal(r.body.items.length, 2, 'original + one generated');
  await a('GET', '/api/summary'); assert.equal((await a('GET', '/api/transactions?q=Sub')).body.items.length, 2, 'idempotent');
});

test('investments and portfolio maths', async () => {
  await a('POST', '/api/investments', { symbol: 'aapl', name: 'Apple', kind: 'stock', quantity: 12, cost_cents: 150000, price_cents: 160000 / 12 | 0 });
  const id = (await a('GET', '/api/portfolio')).body.items[0].id;
  await a('PATCH', `/api/investments/${id}`, { price_cents: 16200 });
  const p = (await a('GET', '/api/portfolio')).body;
  assert.equal(p.items[0].symbol, 'AAPL'); assert.equal(p.items[0].value_cents, 12 * 16200); assert.equal(p.items[0].day_change_cents, 12 * (16200 - 13333));
});

test('csv export neutralises spreadsheet formulas', async () => {
  await a('POST', '/api/transactions', { type: 'expense', amount_cents: 100, wallet_id: walletId, category_id: foodId, date: today, note: '=HYPERLINK("x")' });
  const r = await a('GET', '/api/export.csv'); assert.equal(r.status, 200); assert.ok(r.body.includes(`"'=HYPERLINK`));
});

test('cross-origin writes are rejected and logout clears the session', async () => {
  const res = await fetch(base + '/api/wallets', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://evil.example' }, body: '{}' });
  assert.equal(res.status, 403);
  await b('POST', '/api/auth/logout'); assert.equal((await b('GET', '/api/bootstrap')).status, 401);
});

test('analytics supports day/week/month/year and a custom week start', async () => {
  const day = (await a('GET', `/api/analytics?period=day&date=${today}`)).body;
  assert.equal(day.range.start, today); assert.equal(day.range.end, today); assert.equal(day.trend.length, 7);
  await a('PATCH', '/api/space', { week_start: 6 }); // weeks start on Sunday
  const wk = (await a('GET', `/api/analytics?period=week&date=${today}`)).body;
  assert.equal(D.weekday(wk.range.start), 6, 'week starts on the chosen day'); assert.equal(D.diffDays(wk.range.start, wk.range.end), 6); assert.ok(wk.range.start <= today && today <= wk.range.end);
  await a('PATCH', '/api/space', { week_start: 2 });
  const wk2 = (await a('GET', `/api/analytics?period=week&date=${today}`)).body; assert.equal(D.weekday(wk2.range.start), 2);
  assert.equal((await a('PATCH', '/api/space', { week_start: 9 })).status, 400);
  const yr = (await a('GET', `/api/analytics?period=year&date=${today}`)).body; assert.equal(yr.trend.length, 12); assert.ok(yr.expense_cents >= 40000);
  const mo = (await a('GET', '/api/analytics?period=month')).body;
  const filtered = (await a('GET', `/api/analytics?period=month&category=${mo.by_category[0].category_id}`)).body; assert.ok(filtered.items.every((i) => i.category.id === mo.by_category[0].category_id));
  const bymem = (await a('GET', `/api/analytics?period=month&member=${mo.by_member.find((m) => m.name === 'Tejas').user_id}`)).body; assert.ok(bymem.items.length < mo.items.length);
  const net = (await a('GET', '/api/analytics?period=month&kind=net')).body; assert.ok(net.items.some((i) => i.type === 'income') && net.items.some((i) => i.type === 'expense'));
});

test('weekly budgets follow the chosen week start', async () => {
  const cats = (await a('GET', '/api/bootstrap')).body.categories;
  await a('POST', '/api/budgets', { category_id: cats.find((c) => c.name === 'Transport').id, amount_cents: 10000, period: 'weekly', start_date: D.monthStart(today) });
  await a('PATCH', '/api/space', { week_start: 0 });
  const w0 = (await a('GET', '/api/budgets')).body.items.find((i) => i.period === 'weekly').window;
  await a('PATCH', '/api/space', { week_start: 4 });
  const w4 = (await a('GET', '/api/budgets')).body.items.find((i) => i.period === 'weekly').window;
  assert.equal(D.weekday(w0.start), 0); assert.equal(D.weekday(w4.start), 4);
});

test('profile edit, adding a person directly, and owner-only removal', async () => {
  assert.equal((await a('PATCH', '/api/me', { name: 'Tejas G', color: '#3B82F6' })).status, 200);
  assert.equal((await a('PATCH', '/api/me', { email: 'new@x.io' })).status, 400, 'email change needs password');
  assert.equal((await a('PATCH', '/api/me', { email: 'new@x.io', current_password: 'password1' })).status, 200);
  let boot = (await a('GET', '/api/bootstrap')).body; assert.equal(boot.user.email, 'new@x.io'); assert.equal(boot.space.members.find((m) => m.id === boot.user.id).color, '#3B82F6');
  const code = boot.space.invite_code; void code;
  // account already has 3 people (MAX_MEMBERS=3): adding a 4th fails, remove one first
  assert.equal((await a('POST', '/api/space/members', { name: 'Sam', email: 'sam@x.io', password: 'password1' })).status, 400);
  const third = boot.space.members.find((m) => m.name === 'Third');
  assert.equal((await client()('DELETE', `/api/space/members/${third.id}`)).status, 401);
  const alexBoot = (await (async () => { const c = client(); await c('POST', '/api/auth/login', { email: 'b@x.io', password: 'password1' }); return { c, r: await c('GET', '/api/bootstrap') }; })());
  assert.equal((await alexBoot.c('DELETE', `/api/space/members/${third.id}`)).status, 403, 'only the owner can remove');
  assert.equal((await a('DELETE', `/api/space/members/${third.id}`)).status, 200);
  assert.equal((await a('POST', '/api/space/members', { name: 'Sam', email: 'sam@x.io', password: 'password1' })).status, 201);
  const sam = client(); assert.equal((await sam('POST', '/api/auth/login', { email: 'sam@x.io', password: 'password1' })).status, 200);
  assert.equal((await sam('GET', '/api/bootstrap')).body.space.id, boot.space.id);
  const removed = client(); assert.equal((await removed('POST', '/api/auth/login', { email: 'd@x.io', password: 'password1' })).status, 200);
  assert.notEqual((await removed('GET', '/api/bootstrap')).body.space.id, boot.space.id, 'removed person gets a fresh private account');
});
