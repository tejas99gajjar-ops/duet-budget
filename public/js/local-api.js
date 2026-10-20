// Implements the app's "/route" API on top of the local store + Supabase, so every view keeps calling api('GET','/summary') etc.
import * as Dt from './dates.js';
import * as M from './domain.js';
import * as S from './store.js';

const bad = (m) => new Error(m);
const WALLET_TYPES = ['bank', 'cash', 'savings', 'shared'], PERIODS = ['monthly', 'weekly', 'daily'], KINDS = ['stock', 'crypto', 'etf', 'bond', 'other'], FREQS = ['daily', 'weekly', 'monthly', 'yearly'];
const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const cents = (v) => { const n = Number(v); if (!Number.isInteger(n) || n <= 0 || n > 1e12) throw bad('Amount must be a positive number'); return n; };
const oneOf = (v, list, label) => { if (!list.includes(v)) throw bad(`Invalid ${label}`); return v; };
const color = (v, fb = '#1DDB97') => (/^#[0-9a-fA-F]{6}$/.test(v || '') ? v : fb);
const cleanTags = (t) => (Array.isArray(t) ? t : []).map((x) => str(String(x), 24).replace(/^#/, '')).filter(Boolean).slice(0, 8);

const ctx = () => {
  const { user, data } = S.state;
  if (!user || !data?.space) { window.dispatchEvent(new Event('duet:unauth')); throw bad('Please sign in'); }
  return { user, data, space: data.space, today: Dt.todayIn(data.space.tz) };
};
const money = (c, space) => new Intl.NumberFormat('en-US', { style: 'currency', currency: space.currency }).format(c / 100);

function txFields(c, body, existing) {
  const type = oneOf(body.type ?? existing?.type, ['expense', 'income', 'transfer'], 'type');
  const b = { type, amount_cents: cents(body.amount_cents ?? existing?.amount_cents), wallet_id: Number(body.wallet_id ?? existing?.wallet_id),
    to_wallet_id: type === 'transfer' ? Number(body.to_wallet_id ?? existing?.to_wallet_id) : null, category_id: type === 'transfer' ? null : (body.category_id ?? existing?.category_id ?? null),
    note: str(body.note ?? existing?.note, 500), tags: cleanTags(body.tags ?? existing?.tags ?? []), date: body.date ?? existing?.date, time: (body.time ?? existing?.time ?? '12:00').slice(0, 5),
    status: oneOf(body.status ?? existing?.status ?? 'cleared', ['cleared', 'pending'], 'status') };
  if (!Dt.isDate(b.date)) throw bad('Invalid date'); if (!Dt.isTime(b.time)) throw bad('Invalid time');
  const w = (id) => c.data.wallets.some((x) => x.id === id && !x.archived);
  if (!w(b.wallet_id)) throw bad('Choose a wallet');
  if (type === 'transfer') { if (!w(b.to_wallet_id) || b.to_wallet_id === b.wallet_id) throw bad('Choose two different wallets to transfer between'); }
  else if (b.category_id != null) { const cat = c.data.categories.find((x) => x.id === b.category_id); if (!cat || cat.kind !== b.type) throw bad('Invalid category'); }
  return b;
}
const txRow = (c, b) => ({ space_id: c.space.id, ...b, created_by: c.user.id });

const routes = [];
const route = (method, path, fn) => routes.push({ method, re: new RegExp('^' + path.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), fn });

route('GET', '/bootstrap', async () => {
  const c = ctx(), me = c.data.members.find((m) => m.id === c.user.id);
  return { user: { id: c.user.id, email: c.user.email, name: me?.name || c.user.name }, space: { ...c.space, members: c.data.members, owner_id: c.space.owner_id, max_members: c.space.max_members },
    wallets: M.walletBalances(c.data), categories: c.data.categories.filter((x) => !x.archived).map(({ id, name, icon, kind, color: col }) => ({ id, name, icon, kind, color: col })), today: c.today };
});
route('POST', '/auth/logout', async () => { try { await S.state.backend.auth.signOut(); } catch {} await S.signedOut(); return { ok: true }; });
route('PATCH', '/me', async (_p, _q, body) => {
  const c = ctx(), { name, color: col, current_password, new_password, email } = body;
  if (email !== undefined && String(email).trim().toLowerCase() !== c.user.email.toLowerCase()) throw bad('Changing your email is not supported yet');
  const patch = {}; if (name !== undefined) { patch.name = str(name, 60); if (!patch.name) throw bad('Name required'); } if (col !== undefined) patch.color = color(col);
  if (Object.keys(patch).length) await S.update('members', c.user.id, patch, { user_id: c.user.id });
  if (new_password) { if (String(new_password).length < 8) throw bad('New password must be at least 8 characters'); await S.state.backend.auth.changePassword(c.user.email, String(current_password || ''), new_password); }
  return { ok: true };
});

// wallets & categories
const walletFields = (b, ex) => ({ name: str(b.name ?? ex?.name, 40) || (() => { throw bad('Wallet name required'); })(), type: oneOf(b.type ?? ex?.type ?? 'bank', WALLET_TYPES, 'wallet type'), color: color(b.color ?? ex?.color),
  initial_cents: b.initial_cents !== undefined ? (Number.isInteger(b.initial_cents) ? b.initial_cents : (() => { throw bad('Invalid balance'); })()) : (ex?.initial_cents ?? 0) });
route('POST', '/wallets', async (_p, _q, body) => { const c = ctx(); const n = await S.insert('wallets', { space_id: c.space.id, ...walletFields(body), created_by: c.user.id }); return { id: n.id }; });
route('PATCH', '/wallets/:id', async ({ id }, _q, body) => { const c = ctx(), ex = c.data.wallets.find((w) => w.id === Number(id)); if (!ex) throw bad('Not found'); await S.update('wallets', ex.id, walletFields(body, ex)); return { ok: true }; });
route('DELETE', '/wallets/:id', async ({ id }) => {
  const c = ctx(), ex = c.data.wallets.find((w) => w.id === Number(id)); if (!ex) throw bad('Not found');
  const used = c.data.transactions.some((t) => t.wallet_id === ex.id || t.to_wallet_id === ex.id);
  if (used) await S.update('wallets', ex.id, { archived: true }); else await S.remove('wallets', ex.id);
  return { ok: true, archived: used };
});
route('POST', '/categories', async (_p, _q, body) => { const c = ctx(), name = str(body.name, 30); if (!name) throw bad('Name required');
  const n = await S.insert('categories', { space_id: c.space.id, name, icon: str(body.icon, 8) || '🏷️', kind: oneOf(body.kind || 'expense', ['expense', 'income'], 'kind'), color: color(body.color, '#8B97B3') }); return { id: n.id }; });
route('DELETE', '/categories/:id', async ({ id }) => { const c = ctx(); const cat = c.data.categories.find((x) => x.id === Number(id)); if (!cat) throw bad('Not found');
  for (const b of c.data.budgets.filter((x) => x.category_id === cat.id)) await S.remove('budgets', b.id); await S.update('categories', cat.id, { archived: true }); return { ok: true }; });

// transactions
route('GET', '/transactions', async (_p, q) => {
  const c = ctx(); let rows = c.data.transactions;
  if (q.type) rows = rows.filter((t) => t.type === q.type);
  if (q.wallet) rows = rows.filter((t) => t.wallet_id === Number(q.wallet) || t.to_wallet_id === Number(q.wallet));
  if (q.category) rows = rows.filter((t) => t.category_id === Number(q.category));
  if (q.member) rows = rows.filter((t) => t.created_by === q.member);
  if (q.from && Dt.isDate(q.from)) rows = rows.filter((t) => t.date >= q.from); if (q.to && Dt.isDate(q.to)) rows = rows.filter((t) => t.date <= q.to);
  if (q.q) { const n = q.q.toLowerCase(); rows = rows.filter((t) => t.note.toLowerCase().includes(n) || (t.tags || []).join(' ').toLowerCase().includes(n) || (c.data.categories.find((x) => x.id === t.category_id)?.name || '').toLowerCase().includes(n)); }
  const limit = Math.min(Number(q.limit) || 50, 200), offset = Number(q.offset) || 0, sorted = M.sortTx(rows);
  return { items: sorted.slice(offset, offset + limit).map((t) => M.shapeTx(c.data, t)), has_more: sorted.length > offset + limit };
});
route('POST', '/transactions', async (_p, _q, body) => {
  const c = ctx(), b = txFields(c, body); let recurringId = null;
  if (body.recurring) {
    const freq = oneOf(body.recurring, FREQS, 'frequency');
    const next = freq === 'daily' ? Dt.addDays(b.date, 1) : freq === 'weekly' ? Dt.addDays(b.date, 7) : Dt.addMonths(b.date, freq === 'yearly' ? 12 : 1);
    const r = await S.insert('recurring', { space_id: c.space.id, type: b.type, amount_cents: b.amount_cents, wallet_id: b.wallet_id, to_wallet_id: b.to_wallet_id, category_id: b.category_id, note: b.note, tags: b.tags, frequency: freq, next_date: next, time: b.time, created_by: c.user.id });
    recurringId = r.id;
  }
  const n = await S.insert('transactions', { ...txRow(c, b), recurring_id: recurringId }); return { id: n.id };
});
route('GET', '/transactions/:id', async ({ id }) => {
  const c = ctx(), t = c.data.transactions.find((x) => x.id === Number(id)); if (!t) throw bad('Not found');
  const similar = t.category_id ? M.sortTx(c.data.transactions.filter((x) => x.category_id === t.category_id && x.id !== t.id && x.type === t.type)).slice(0, 3).map((x) => M.shapeTx(c.data, x)) : [];
  let impact = null;
  if (t.type === 'expense' && t.category_id) {
    const b = c.data.budgets.find((x) => x.category_id === t.category_id);
    if (b) { const win = Dt.periodWindow(b.period, t.date, c.space.week_start); const spent = c.data.transactions.filter((x) => x.type === 'expense' && x.category_id === t.category_id && x.date >= win.start && x.date <= win.end).reduce((s, x) => s + x.amount_cents, 0);
      impact = { limit_cents: b.amount_cents, after_pct: spent / b.amount_cents, before_pct: (spent - t.amount_cents) / b.amount_cents }; }
  }
  return { ...M.shapeTx(c.data, t), similar, budget_impact: impact };
});
route('PATCH', '/transactions/:id', async ({ id }, _q, body) => { const c = ctx(), ex = c.data.transactions.find((x) => x.id === Number(id)); if (!ex) throw bad('Not found');
  const b = txFields(c, body, ex); await S.update('transactions', ex.id, b); return { ok: true }; });
route('DELETE', '/transactions/:id', async ({ id }) => { const c = ctx(); if (!c.data.transactions.some((x) => x.id === Number(id))) throw bad('Not found'); await S.remove('transactions', Number(id)); return { ok: true }; });

// budgets
route('GET', '/budgets', async (_p, q) => { const c = ctx(); return { ...M.budgetsOverview(c.data, c.today, q.mode === 'all' ? 'all' : 'period', c.space.week_start), today: c.today }; });
route('POST', '/budgets', async (_p, _q, b) => {
  const c = ctx(), cat = c.data.categories.find((x) => x.id === Number(b.category_id) && x.kind === 'expense'); if (!cat) throw bad('Choose a category');
  if (c.data.budgets.some((x) => x.category_id === cat.id)) throw bad('That category already has a budget');
  const start = b.start_date || Dt.monthStart(c.today); if (!Dt.isDate(start)) throw bad('Invalid start date');
  const n = await S.insert('budgets', { space_id: c.space.id, category_id: cat.id, amount_cents: cents(b.amount_cents), period: oneOf(b.period || 'monthly', PERIODS, 'period'), rollover: !!b.rollover, start_date: start, created_by: c.user.id }); return { id: n.id };
});
route('PATCH', '/budgets/:id', async ({ id }, _q, b) => { const c = ctx(), ex = c.data.budgets.find((x) => x.id === Number(id)); if (!ex) throw bad('Not found');
  await S.update('budgets', ex.id, { amount_cents: b.amount_cents !== undefined ? cents(b.amount_cents) : ex.amount_cents, period: oneOf(b.period ?? ex.period, PERIODS, 'period'), rollover: b.rollover === undefined ? ex.rollover : !!b.rollover }); return { ok: true }; });
route('DELETE', '/budgets/:id', async ({ id }) => { const c = ctx(); if (!c.data.budgets.some((x) => x.id === Number(id))) throw bad('Not found'); await S.remove('budgets', Number(id)); return { ok: true }; });

route('GET', '/summary', async () => { const c = ctx(); return M.summary(c.data, c.today); });
route('GET', '/analytics', async (_p, q) => { const c = ctx(); return M.analytics(c.data, c.today, { period: q.period, date: q.date, kind: ['income', 'net'].includes(q.kind) ? q.kind : 'expense', category: q.category, member: q.member }); });
route('GET', '/recurring', async () => { const c = ctx(); return { items: c.data.recurring.filter((r) => r.active).sort((a, b) => (a.next_date < b.next_date ? -1 : 1)) }; });
route('DELETE', '/recurring/:id', async ({ id }) => { ctx(); await S.update('recurring', Number(id), { active: false }); return { ok: true }; });

// investments (prices are typed in by hand; the app calls no market-data service)
const invFields = (b, ex) => ({ symbol: str(b.symbol ?? ex?.symbol, 12).toUpperCase() || (() => { throw bad('Symbol required'); })(), name: str(b.name ?? ex?.name, 60), kind: oneOf(b.kind ?? ex?.kind ?? 'stock', KINDS, 'kind'),
  quantity: (() => { const q = Number(b.quantity ?? ex?.quantity); if (!(q > 0)) throw bad('Quantity must be positive'); return q; })(),
  cost_cents: Number.isInteger(b.cost_cents ?? ex?.cost_cents ?? 0) ? (b.cost_cents ?? ex?.cost_cents ?? 0) : (() => { throw bad('Invalid cost'); })(), price_cents: cents(b.price_cents ?? ex?.price_cents) });
route('GET', '/portfolio', async () => M.portfolio(ctx().data));
route('POST', '/investments', async (_p, _q, b) => { const c = ctx(), i = invFields(b); const n = await S.insert('investments', { space_id: c.space.id, ...i, prev_price_cents: i.price_cents, created_by: c.user.id }); return { id: n.id }; });
route('PATCH', '/investments/:id', async ({ id }, _q, b) => { const c = ctx(), ex = c.data.investments.find((x) => x.id === Number(id)); if (!ex) throw bad('Not found'); const i = invFields(b, ex);
  await S.update('investments', ex.id, { ...i, prev_price_cents: i.price_cents !== ex.price_cents ? ex.price_cents : ex.prev_price_cents, price_updated_at: new Date().toISOString() }); return { ok: true }; });
route('DELETE', '/investments/:id', async ({ id }) => { ctx(); await S.remove('investments', Number(id)); return { ok: true }; });

// shared account
route('PATCH', '/space', async (_p, _q, b) => {
  const c = ctx(), patch = {};
  if (b.name !== undefined) patch.name = str(b.name, 60) || c.space.name;
  if (b.currency !== undefined && /^[A-Z]{3}$/.test(b.currency)) patch.currency = b.currency;
  if (b.tz) { try { new Intl.DateTimeFormat('en', { timeZone: b.tz }); patch.tz = b.tz; } catch { throw bad('Unknown time zone'); } }
  if (b.week_start !== undefined) { const ws = Number(b.week_start); if (!Number.isInteger(ws) || ws < 0 || ws > 6) throw bad('Invalid week start'); patch.week_start = ws; }
  await S.update('spaces', c.space.id, patch); return { ok: true };
});
route('POST', '/space/invite/regenerate', async () => { const c = ctx(); const code = await S.state.backend.rpc('regenerate_invite'); await S.refresh(['spaces']); return { invite_code: code, id: c.space.id }; });
route('POST', '/space/join', async (_p, _q, b) => { const c = ctx(); const me = c.data.members.find((m) => m.id === c.user.id);
  await S.state.backend.rpc('join_space', { p_code: str(b.code, 20), p_user_name: me?.name || c.user.name }); await S.rejoin(); return { ok: true }; });
route('DELETE', '/space/members/:id', async ({ id }) => { ctx(); await S.state.backend.rpc('remove_member', { p_user: id }); await S.refresh(['members', 'activity']); return { ok: true }; });
route('DELETE', '/space/data', async () => { ctx(); await S.rpc('wipe_data'); return { ok: true }; });
route('GET', '/activity', async () => { ctx(); try { await S.refresh(['activity']); } catch {} const c = ctx(); return { items: [...c.data.activity].sort((a, b) => b.id - a.id).map((a) => ({ id: a.id, text: a.text, ts: String(a.ts).replace(' ', 'T'), user_name: c.data.members.find((m) => m.id === a.user_id)?.name })) }; });

export async function request(method, fullPath, body) {
  const [path, qstr = ''] = fullPath.split('?'), query = Object.fromEntries(new URLSearchParams(qstr));
  for (const r of routes) { if (r.method !== method) continue; const m = r.re.exec(path); if (m) return r.fn(m.groups || {}, query, body || {}); }
  throw bad('Not found');
}
export function downloadCsv() {
  const c = ctx(), blob = new Blob([M.csv(c.data)], { type: 'text/csv;charset=utf-8' }), a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `duet-export-${c.today}.csv`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
