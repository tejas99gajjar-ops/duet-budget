// Runs the REAL app UI against the REAL supabase/schema.sql inside an in-browser Postgres (PGlite). No network, no Supabase account.
import { PGlite, types } from '/pglite/index.js';
import { createDbWith, pgBackend } from '/test/pg-backend.js';
const schema = await (await fetch('/supabase/schema.sql')).text();
const db = await createDbWith(PGlite, types, schema);
const params = new URLSearchParams(location.search);
const be = pgBackend(db, params.get('email') || 'demo@duet.local', params.get('name') || 'Tejas Gajjar');
window.DUET_TEST_BACKEND = be; window.__db = db; window.__be = be;
await be.auth.signUp();
if (params.get('seed') !== '0') {
  await be.rpc('create_space', { p_name: "Tejas's shared budget", p_user_name: 'Tejas Gajjar', p_tz: 'UTC' });
  const sid = (await be.fetchAll('spaces'))[0].id, cats = Object.fromEntries((await be.fetchAll('categories')).map((c) => [c.name, c.id]));
  const today = new Date().toISOString().slice(0, 10), mk = (n) => { const d = new Date(today + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
  const w = (await be.insert('wallets', { space_id: sid, name: 'Main Checking', type: 'bank', color: '#1DDB97', initial_cents: 300000 })).id;
  await be.insert('wallets', { space_id: sid, name: 'Rainy Day Fund', type: 'savings', color: '#3B82F6', initial_cents: 820000 });
  const tx = (o) => be.insert('transactions', { space_id: sid, wallet_id: w, ...o });
  await tx({ type: 'income', amount_cents: 455000, category_id: cats['Salary'], date: mk(18), note: 'Salary' });
  await tx({ type: 'expense', amount_cents: 62000, category_id: cats['Bills & Utilities'], date: mk(19), note: 'Electricity Bill', tags: ['bills'] });
  await tx({ type: 'expense', amount_cents: 8420, category_id: cats['Groceries'], date: mk(1), note: 'Weekly grocery haul', tags: ['groceries'] });
  await tx({ type: 'expense', amount_cents: 5490, category_id: cats['Food & Drinks'], date: mk(0), note: 'Dinner & drinks', tags: ['dinner'] });
  for (const [c, a] of [['Bills & Utilities', 130000], ['Food & Drinks', 45000], ['Groceries', 40000]]) await be.insert('budgets', { space_id: sid, category_id: cats[c], amount_cents: a, start_date: mk(Number(today.slice(8, 10)) - 1) });
  await be.insert('investments', { space_id: sid, symbol: 'AAPL', name: 'Apple', kind: 'stock', quantity: 12, cost_cents: 150000, price_cents: 16200, prev_price_cents: 15800 });
}
await import('/js/app.js');
