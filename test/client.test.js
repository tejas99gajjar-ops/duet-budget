// Integration test of the browser-side API (public/js/local-api.js + store + domain) against the real SQL schema in PGlite,
// plus an equivalence check against the original Node/SQLite server for identical data.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
// NB: PGlite misdetects a browser if a global `window` exists while it boots, so the stub is installed after the database is created.
const S = await import('../public/js/store.js');
const { request } = await import('../public/js/local-api.js');
const Dt = await import('../public/js/dates.js');
const { createDb, pgBackend } = await import('./pg-node.js');

let db, be, today, wallet, savings, cats = {};
const api = (m, p, b) => request(m, p, b);
before(async () => {
  db = await createDb(); globalThis.window = { dispatchEvent() {}, addEventListener() {} }; be = pgBackend(db, 'tejas@x.io', 'Tejas'); S.configure(be);
  S.state.user = await be.auth.signUp(); await be.rpc('create_space', { p_name: 'Test', p_user_name: 'Tejas', p_tz: 'UTC' }); await S.init();
  const boot = await api('GET', '/bootstrap'); today = boot.today; for (const c of boot.categories) cats[c.name] = c.id;
});

test('bootstrap gives the space, categories and members', async () => {
  const b = await api('GET', '/bootstrap'); assert.equal(b.space.members.length, 1); assert.equal(b.categories.length, 15); assert.equal(b.space.owner_id, b.user.id);
});
test('wallets, transactions, transfers and balances', async () => {
  wallet = (await api('POST', '/wallets', { name: 'Main', type: 'bank', initial_cents: 300000 })).id; savings = (await api('POST', '/wallets', { name: 'Savings', type: 'savings', initial_cents: 0 })).id;
  await api('POST', '/transactions', { type: 'income', amount_cents: 455000, wallet_id: wallet, category_id: cats['Salary'], date: today });
  await api('POST', '/transactions', { type: 'expense', amount_cents: 5490, wallet_id: wallet, category_id: cats['Food & Drinks'], date: today, note: 'Dinner', tags: ['#dinner'] });
  await api('POST', '/transactions', { type: 'transfer', amount_cents: 100000, wallet_id: wallet, to_wallet_id: savings, date: today });
  const b = await api('GET', '/bootstrap'); const bal = Object.fromEntries(b.wallets.map((w) => [w.name, w.balance_cents]));
  assert.equal(bal.Main, 300000 + 455000 - 5490 - 100000); assert.equal(bal.Savings, 100000);
  await assert.rejects(api('POST', '/transactions', { type: 'transfer', amount_cents: 1, wallet_id: wallet, to_wallet_id: wallet, date: today }), /different wallets/);
  await assert.rejects(api('POST', '/transactions', { type: 'expense', amount_cents: 5, wallet_id: wallet, category_id: cats['Salary'], date: today }), /Invalid category/);
});
test('budgets, summary pacing and rule-based insights', async () => {
  await api('POST', '/budgets', { category_id: cats['Food & Drinks'], amount_cents: 45000, start_date: Dt.monthStart(today) });
  await assert.rejects(api('POST', '/budgets', { category_id: cats['Food & Drinks'], amount_cents: 1 }), /already has a budget/);
  const left = Math.max(1, Dt.diffDays(today, Dt.monthEnd(today))); const b = await api('GET', '/budgets'); const f = b.items[0];
  assert.equal(f.spent_cents, 5490); assert.equal(f.safe_per_day_cents, Math.round((45000 - 5490) / left));
  await api('POST', '/transactions', { type: 'expense', amount_cents: 40000, wallet_id: wallet, category_id: cats['Food & Drinks'], date: today });
  const s = await api('GET', '/summary'); assert.equal(s.expense_cents, 45490); assert.ok(s.insights.some((i) => i.text.includes('Food')));
});
test('analytics: periods, custom week start, drill-down, all items ranked', async () => {
  await api('PATCH', '/space', { week_start: 6 }); const wk = await api('GET', `/analytics?period=week&date=${today}`); assert.equal(Dt.weekday(wk.range.start), 6);
  const m = await api('GET', '/analytics?period=month'); assert.equal(m.items[0].amount_cents, 40000); assert.equal(m.items.at(-1).cumulative_share, 1); assert.equal(m.trend.at(-1).projected, true);
  const f = await api('GET', `/analytics?period=month&category=${cats['Food & Drinks']}`); assert.ok(f.items.every((i) => i.category.id === cats['Food & Drinks']));
});
test('edit, delete, search', async () => {
  const l = await api('GET', '/transactions?q=dinner'); assert.equal(l.items.length, 1); const id = l.items[0].id;
  await api('PATCH', `/transactions/${id}`, { amount_cents: 6000 }); assert.equal((await api('GET', `/transactions/${id}`)).amount_cents, 6000);
  await api('DELETE', `/transactions/${id}`); await assert.rejects(api('GET', `/transactions/${id}`), /Not found/);
});
test('activity log is written by the database trigger', async () => {
  const a = await api('GET', '/activity'); assert.ok(a.items.some((i) => /added expense/.test(i.text)) && a.items.some((i) => /deleted expense/.test(i.text)));
});
test('OFFLINE: transactions are queued, show instantly, and sync when back online', async () => {
  be.setOffline(true);
  const r = await api('POST', '/transactions', { type: 'expense', amount_cents: 1234, wallet_id: wallet, category_id: cats['Groceries'], date: today, note: 'Offline milk' });
  assert.ok(r.id < 0, 'temporary id'); assert.equal(S.pending(), 1);
  const l = await api('GET', '/transactions?q=milk'); assert.equal(l.items[0].pending_sync, true);
  await api('PATCH', `/transactions/${r.id}`, { amount_cents: 1500 });                           // editing a queued row folds into the queued insert
  const two = await api('POST', '/transactions', { type: 'expense', amount_cents: 700, wallet_id: wallet, category_id: cats['Groceries'], date: today, note: 'Offline bread' });
  await api('DELETE', `/transactions/${two.id}`);                                                  // deleting a queued row cancels it
  assert.equal(S.pending(), 1); await assert.rejects(api('POST', '/wallets', { name: 'X', type: 'cash' }), /offline/i);
  be.setOffline(false); await S.flush();
  assert.equal(S.pending(), 0); const after = await api('GET', '/transactions?q=milk'); assert.equal(after.items.length, 1); assert.ok(after.items[0].id > 0); assert.equal(after.items[0].amount_cents, 1500); assert.ok(!after.items[0].pending_sync);
  assert.equal((await db.query(`select count(*)::int n from transactions where note='Offline milk'`)).rows[0].n, 1, 'exactly one row in the database');
});
test('recurring rules are created and materialised by the database', async () => {
  await api('POST', '/transactions', { type: 'expense', amount_cents: 999, wallet_id: wallet, category_id: cats['Groceries'], date: Dt.addDays(today, -40), note: 'Sub', recurring: 'monthly' });
  assert.equal(await be.rpc('run_recurring'), 1); await S.refresh(); assert.equal((await api('GET', '/transactions?q=Sub')).items.length, 2); assert.equal(await be.rpc('run_recurring'), 0);
});
test('investments, wallets archive, CSV safe', async () => {
  const i = await api('POST', '/investments', { symbol: 'aapl', name: 'Apple', kind: 'stock', quantity: 12, cost_cents: 150000, price_cents: 13333 }); await api('PATCH', `/investments/${i.id}`, { price_cents: 16200 });
  const p = await api('GET', '/portfolio'); assert.equal(p.items[0].symbol, 'AAPL'); assert.equal(p.items[0].day_change_cents, 12 * (16200 - 13333));
  const w = await api('POST', '/wallets', { name: 'Tmp', type: 'cash' }); assert.equal((await api('DELETE', `/wallets/${w.id}`)).archived, false);
  assert.equal((await api('DELETE', `/wallets/${savings}`)).archived, true);
  await api('POST', '/transactions', { type: 'expense', amount_cents: 100, wallet_id: wallet, category_id: cats['Food & Drinks'], date: today, note: '=HYPERLINK("x")' });
  const { csv } = await import('../public/js/domain.js'); assert.ok(csv(S.state.data).includes(`"'=HYPERLINK`));
});
test('a partner joins by invite code and shares everything; strangers see nothing', async () => {
  const code = (await be.fetchAll('spaces'))[0].invite_code; const partner = pgBackend(db, 'alex@x.io', 'Alex'); await partner.auth.signUp();
  await assert.rejects(partner.rpc('join_space', { p_code: 'NOPE', p_user_name: 'Alex' }), /not found/);
  await partner.rpc('join_space', { p_code: code, p_user_name: 'Alex' });
  assert.equal((await partner.fetchAll('wallets')).length, (await be.fetchAll('wallets')).length); assert.equal((await partner.fetchAll('members')).length, 2);
  const stranger = pgBackend(db, 'eve@x.io', 'Eve'); await stranger.auth.signUp(); assert.equal((await stranger.fetchAll('transactions')).length, 0);
  await assert.rejects(stranger.insert('wallets', { space_id: (await be.fetchAll('spaces'))[0].id, name: 'hack', type: 'bank' }), /row-level security/);
  await assert.rejects(partner.rpc('remove_member', { p_user: S.state.user.id }), /owner/i);
  await S.refresh(); const b = await api('GET', '/bootstrap'); assert.equal(b.space.members.length, 2);
  const a = await api('GET', `/analytics?period=month`); assert.equal(a.by_member.length, 2);
  await api('DELETE', `/space/members/${(await partner.auth.getSession()).id}`); assert.equal((await api('GET', '/bootstrap')).space.members.length, 1);
});
