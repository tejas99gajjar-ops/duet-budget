import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { openDb, tx as inTx } from './lib/db.js';
import * as A from './lib/auth.js';
import * as D from './lib/dates.js';
import * as M from './lib/domain.js';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const MAX_MEMBERS = Number(process.env.MAX_MEMBERS || 6);
const MEMBER_COLORS = ['#1DDB97', '#7C5FE6', '#F5A623', '#3B82F6', '#E879A0', '#F04444'];
const WALLET_TYPES = ['bank', 'cash', 'savings', 'shared'];
const PERIODS = ['monthly', 'weekly', 'daily'];
const KINDS = ['stock', 'crypto', 'etf', 'bond', 'other'];
const FREQS = ['daily', 'weekly', 'monthly', 'yearly'];

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const bad = (m) => new HttpError(400, m);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.ico': 'image/x-icon' };

const str = (v, max = 200) => { if (typeof v !== 'string') return ''; return v.trim().slice(0, max); };
const cents = (v) => { const n = Number(v); if (!Number.isInteger(n) || n <= 0 || n > 1e12) throw bad('Amount must be a positive number'); return n; };
const oneOf = (v, list, label) => { if (!list.includes(v)) throw bad(`Invalid ${label}`); return v; };
const color = (v, fallback = '#1DDB97') => (/^#[0-9a-fA-F]{6}$/.test(v || '') ? v : fallback);
const newCode = () => randomBytes(5).toString('base64url').replace(/[-_]/g, 'x').slice(0, 7).toUpperCase();
const cleanTags = (t) => JSON.stringify((Array.isArray(t) ? t : []).map((x) => str(String(x), 24).replace(/^#/, '')).filter(Boolean).slice(0, 8));

export function createApp({ dbFile = process.env.DATABASE_FILE || join(ROOT, 'data', 'duet.db'), secureCookies = process.env.COOKIE_SECURE === '1' } = {}) {
  const db = openDb(dbFile);
  const loginLimit = A.makeLimiter(10, 15 * 60 * 1000);
  const streams = new Map(); // spaceId -> Set(res)

  const publish = (spaceId, event = 'change', data = {}) => {
    for (const res of streams.get(spaceId) || []) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };
  const log = (ctx, text) => db.prepare('INSERT INTO activity(space_id,user_id,text) VALUES(?,?,?)').run(ctx.space.id, ctx.user.id, text);
  const money = (c, space) => new Intl.NumberFormat('en-US', { style: 'currency', currency: space.currency }).format(c / 100);

  const getSpace = (userId) => db.prepare('SELECT s.* FROM spaces s JOIN members m ON m.space_id=s.id WHERE m.user_id=?').get(userId);
  const members = (spaceId) => db.prepare('SELECT u.id,u.name,u.email,m.color FROM members m JOIN users u ON u.id=m.user_id WHERE m.space_id=? ORDER BY m.joined_at,u.id').all(spaceId);
  const ownerId = (spaceId) => members(spaceId)[0]?.id;
  const requireOwner = (ctx) => { if (ownerId(ctx.space.id) !== ctx.user.id) throw new HttpError(403, 'Only the account owner can do that'); };

  function seedSpace(spaceId) {
    const ins = db.prepare('INSERT INTO categories(space_id,name,icon,kind,color) VALUES(?,?,?,?,?)');
    for (const [n, i, c] of M.DEFAULT_EXPENSE_CATS) ins.run(spaceId, n, i, 'expense', c);
    for (const [n, i, c] of M.DEFAULT_INCOME_CATS) ins.run(spaceId, n, i, 'income', c);
  }
  function createSpaceFor(userId, name, tz) {
    const r = db.prepare('INSERT INTO spaces(name,tz,invite_code) VALUES(?,?,?)').run(name, validTz(tz), newCode());
    db.prepare('INSERT INTO members(space_id,user_id,color) VALUES(?,?,?)').run(r.lastInsertRowid, userId, MEMBER_COLORS[0]);
    seedSpace(r.lastInsertRowid);
    return r.lastInsertRowid;
  }
  function joinSpace(userId, code) {
    const space = db.prepare('SELECT * FROM spaces WHERE invite_code=?').get(str(code, 20).toUpperCase());
    if (!space) throw bad('That invite code was not found');
    const n = members(space.id).length;
    if (n >= MAX_MEMBERS) throw bad('That shared account is already full');
    db.prepare('INSERT INTO members(space_id,user_id,color) VALUES(?,?,?)').run(space.id, userId, MEMBER_COLORS[n % MEMBER_COLORS.length]);
    return space;
  }
  const validTz = (tz) => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return tz; } catch { return 'UTC'; } };

  function checkRefs(ctx, b) {
    const w = (id) => db.prepare('SELECT 1 FROM wallets WHERE id=? AND space_id=?').get(id, ctx.space.id);
    if (!w(b.wallet_id)) throw bad('Choose a wallet');
    if (b.type === 'transfer') {
      if (!w(b.to_wallet_id) || b.to_wallet_id === b.wallet_id) throw bad('Choose two different wallets to transfer between');
    } else if (b.category_id != null) {
      const c = db.prepare('SELECT kind FROM categories WHERE id=? AND space_id=?').get(b.category_id, ctx.space.id);
      if (!c || c.kind !== b.type) throw bad('Invalid category');
    }
  }
  function txBody(ctx, body, existing) {
    const type = oneOf(body.type ?? existing?.type, ['expense', 'income', 'transfer'], 'type');
    const b = {
      type, amount_cents: cents(body.amount_cents ?? existing?.amount_cents), wallet_id: Number(body.wallet_id ?? existing?.wallet_id),
      to_wallet_id: type === 'transfer' ? Number(body.to_wallet_id ?? existing?.to_wallet_id) : null,
      category_id: type === 'transfer' ? null : (body.category_id ?? existing?.category_id ?? null),
      note: str(body.note ?? existing?.note, 500), tags: cleanTags(body.tags ?? (existing ? JSON.parse(existing.tags) : [])),
      date: body.date ?? existing?.date, time: body.time ?? existing?.time ?? '12:00', status: oneOf(body.status ?? existing?.status ?? 'cleared', ['cleared', 'pending'], 'status'),
    };
    if (!D.isDate(b.date)) throw bad('Invalid date'); if (!D.isTime(b.time)) throw bad('Invalid time');
    checkRefs(ctx, b); return b;
  }
  const TX_SELECT = `SELECT t.*,c.name cat_name,c.icon cat_icon,c.color cat_color,w.name wallet_name,w2.name to_wallet_name,u.name user_name
    FROM transactions t LEFT JOIN categories c ON c.id=t.category_id LEFT JOIN wallets w ON w.id=t.wallet_id LEFT JOIN wallets w2 ON w2.id=t.to_wallet_id LEFT JOIN users u ON u.id=t.created_by`;

  // ---------- route table ----------
  const routes = [];
  const route = (method, path, opts, fn) => routes.push({ method, re: new RegExp('^' + path.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), auth: opts.auth !== false, fn });

  route('POST', '/api/auth/signup', { auth: false }, (ctx) => {
    const { name, email, password, invite, tz } = ctx.body;
    const n = str(name, 60), e = str(email, 200).toLowerCase();
    if (!n) throw bad('Please enter your name'); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw bad('Please enter a valid email');
    if (typeof password !== 'string' || password.length < 8) throw bad('Password must be at least 8 characters');
    if (!loginLimit('signup:' + ctx.ip)) throw new HttpError(429, 'Too many attempts, try again later');
    if (db.prepare('SELECT 1 FROM users WHERE email=?').get(e)) throw bad('An account with this email already exists');
    const { salt, hash } = A.hashPassword(password);
    const userId = inTx(db, () => {
      const id = Number(db.prepare('INSERT INTO users(email,name,pw_hash,pw_salt) VALUES(?,?,?,?)').run(e, n, hash, salt).lastInsertRowid);
      if (str(invite, 20)) joinSpace(id, invite); else createSpaceFor(id, `${n.split(' ')[0]}'s shared budget`, tz);
      return id;
    });
    const space = getSpace(userId);
    db.prepare('INSERT INTO activity(space_id,user_id,text) VALUES(?,?,?)').run(space.id, userId, `${n} joined`);
    publish(space.id);
    return { token: A.createSession(db, userId), _status: 201 };
  });
  route('POST', '/api/auth/login', { auth: false }, (ctx) => {
    const e = str(ctx.body.email, 200).toLowerCase();
    if (!loginLimit('login:' + ctx.ip + e)) throw new HttpError(429, 'Too many attempts, try again later');
    const u = db.prepare('SELECT * FROM users WHERE email=?').get(e);
    if (!u || typeof ctx.body.password !== 'string' || !A.verifyPassword(ctx.body.password, u.pw_salt, u.pw_hash)) throw new HttpError(401, 'Incorrect email or password');
    return { token: A.createSession(db, u.id) };
  });
  route('POST', '/api/auth/logout', {}, (ctx) => { A.destroySession(db, ctx.token); return { ok: true, clear: true }; });

  route('GET', '/api/bootstrap', {}, (ctx) => {
    M.runRecurring(db, ctx.space.id, D.todayIn(ctx.space.tz));
    return {
      user: ctx.user, space: { ...ctx.space, members: members(ctx.space.id), owner_id: ownerId(ctx.space.id), max_members: MAX_MEMBERS },
      wallets: M.walletBalances(db, ctx.space.id),
      categories: db.prepare('SELECT id,name,icon,kind,color FROM categories WHERE space_id=? AND archived=0 ORDER BY id').all(ctx.space.id),
      today: D.todayIn(ctx.space.tz),
    };
  });
  route('PATCH', '/api/me', {}, (ctx) => {
    const { name, current_password, new_password, email, color: col } = ctx.body;
    if (email !== undefined) {
      const e = str(email, 200).toLowerCase(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw bad('Please enter a valid email');
      const u = db.prepare('SELECT * FROM users WHERE id=?').get(ctx.user.id);
      if (e !== u.email) {
        if (!A.verifyPassword(String(current_password || ''), u.pw_salt, u.pw_hash)) throw bad('Enter your current password to change your email');
        if (db.prepare('SELECT 1 FROM users WHERE email=? AND id<>?').get(e, ctx.user.id)) throw bad('That email is already in use');
        db.prepare('UPDATE users SET email=? WHERE id=?').run(e, ctx.user.id);
      }
    }
    if (col !== undefined) db.prepare('UPDATE members SET color=? WHERE user_id=?').run(color(col), ctx.user.id);
    if (name !== undefined) { const n = str(name, 60); if (!n) throw bad('Name required'); db.prepare('UPDATE users SET name=? WHERE id=?').run(n, ctx.user.id); }
    if (new_password !== undefined && new_password !== '') {
      const u = db.prepare('SELECT * FROM users WHERE id=?').get(ctx.user.id);
      if (!A.verifyPassword(String(current_password || ''), u.pw_salt, u.pw_hash)) throw bad('Current password is incorrect');
      if (String(new_password).length < 8) throw bad('New password must be at least 8 characters');
      const { salt, hash } = A.hashPassword(new_password);
      db.prepare('UPDATE users SET pw_hash=?,pw_salt=? WHERE id=?').run(hash, salt, ctx.user.id);
      A.destroyUserSessions(db, ctx.user.id, ctx.token);
    }
    publish(ctx.space.id); return { ok: true };
  });

  // wallets
  const walletBody = (b, ex) => ({
    name: str(b.name ?? ex?.name, 40) || (() => { throw bad('Wallet name required'); })(),
    type: oneOf(b.type ?? ex?.type ?? 'bank', WALLET_TYPES, 'wallet type'), color: color(b.color ?? ex?.color),
    initial_cents: b.initial_cents !== undefined ? (Number.isInteger(b.initial_cents) ? b.initial_cents : (() => { throw bad('Invalid balance'); })()) : (ex?.initial_cents ?? 0),
  });
  route('POST', '/api/wallets', {}, (ctx) => {
    const w = walletBody(ctx.body);
    const id = db.prepare('INSERT INTO wallets(space_id,name,type,color,initial_cents,created_by) VALUES(?,?,?,?,?,?)').run(ctx.space.id, w.name, w.type, w.color, w.initial_cents, ctx.user.id).lastInsertRowid;
    log(ctx, `${ctx.user.name} added wallet ${w.name}`); return { id: Number(id), _status: 201 };
  });
  route('PATCH', '/api/wallets/:id', {}, (ctx) => {
    const ex = db.prepare('SELECT * FROM wallets WHERE id=? AND space_id=?').get(ctx.params.id, ctx.space.id); if (!ex) throw new HttpError(404, 'Not found');
    const w = walletBody(ctx.body, ex);
    db.prepare('UPDATE wallets SET name=?,type=?,color=?,initial_cents=? WHERE id=?').run(w.name, w.type, w.color, w.initial_cents, ex.id); return { ok: true };
  });
  route('DELETE', '/api/wallets/:id', {}, (ctx) => {
    const ex = db.prepare('SELECT * FROM wallets WHERE id=? AND space_id=?').get(ctx.params.id, ctx.space.id); if (!ex) throw new HttpError(404, 'Not found');
    const n = db.prepare('SELECT COUNT(*) c FROM transactions WHERE wallet_id=? OR to_wallet_id=?').get(ex.id, ex.id).c;
    if (n) { db.prepare('UPDATE wallets SET archived=1 WHERE id=?').run(ex.id); } else db.prepare('DELETE FROM wallets WHERE id=?').run(ex.id);
    log(ctx, `${ctx.user.name} removed wallet ${ex.name}`); return { ok: true, archived: n > 0 };
  });

  // categories
  route('POST', '/api/categories', {}, (ctx) => {
    const name = str(ctx.body.name, 30); if (!name) throw bad('Name required');
    const id = db.prepare('INSERT INTO categories(space_id,name,icon,kind,color) VALUES(?,?,?,?,?)')
      .run(ctx.space.id, name, str(ctx.body.icon, 8) || '🏷️', oneOf(ctx.body.kind || 'expense', ['expense', 'income'], 'kind'), color(ctx.body.color, '#8B97B3')).lastInsertRowid;
    return { id: Number(id), _status: 201 };
  });
  route('DELETE', '/api/categories/:id', {}, (ctx) => {
    const r = db.prepare('UPDATE categories SET archived=1 WHERE id=? AND space_id=?').run(ctx.params.id, ctx.space.id);
    if (!r.changes) throw new HttpError(404, 'Not found'); db.prepare('DELETE FROM budgets WHERE category_id=?').run(ctx.params.id); return { ok: true };
  });

  // transactions
  route('GET', '/api/transactions', {}, (ctx) => {
    const q = ctx.query, where = ['t.space_id=?'], args = [ctx.space.id];
    if (q.type) { where.push('t.type=?'); args.push(q.type); }
    if (q.wallet) { where.push('(t.wallet_id=? OR t.to_wallet_id=?)'); args.push(Number(q.wallet), Number(q.wallet)); }
    if (q.category) { where.push('t.category_id=?'); args.push(Number(q.category)); }
    if (q.member) { where.push('t.created_by=?'); args.push(Number(q.member)); }
    if (q.from && D.isDate(q.from)) { where.push('t.date>=?'); args.push(q.from); }
    if (q.to && D.isDate(q.to)) { where.push('t.date<=?'); args.push(q.to); }
    if (q.q) { where.push(`(t.note LIKE ? ESCAPE '\\' OR t.tags LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\')`); const like = '%' + q.q.replace(/[\\%_]/g, '\\$&') + '%'; args.push(like, like, like); }
    const limit = Math.min(Number(q.limit) || 50, 200), offset = Number(q.offset) || 0;
    const rows = db.prepare(`${TX_SELECT} WHERE ${where.join(' AND ')} ORDER BY t.date DESC,t.time DESC,t.id DESC LIMIT ? OFFSET ?`).all(...args, limit + 1, offset);
    return { items: rows.slice(0, limit).map(M.shapeTx), has_more: rows.length > limit };
  });
  route('POST', '/api/transactions', {}, (ctx) => {
    const b = txBody(ctx, ctx.body); let recurringId = null;
    return inTx(db, () => {
      if (ctx.body.recurring) {
        const freq = oneOf(ctx.body.recurring, FREQS, 'frequency');
        const next = freq === 'daily' ? D.addDays(b.date, 1) : freq === 'weekly' ? D.addDays(b.date, 7) : D.addMonths(b.date, freq === 'yearly' ? 12 : 1);
        recurringId = Number(db.prepare(`INSERT INTO recurring(space_id,type,amount_cents,wallet_id,to_wallet_id,category_id,note,tags,frequency,next_date,time,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(ctx.space.id, b.type, b.amount_cents, b.wallet_id, b.to_wallet_id, b.category_id, b.note, b.tags, freq, next, b.time, ctx.user.id).lastInsertRowid);
      }
      const id = Number(db.prepare(`INSERT INTO transactions(space_id,type,amount_cents,wallet_id,to_wallet_id,category_id,note,tags,date,time,status,created_by,recurring_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(ctx.space.id, b.type, b.amount_cents, b.wallet_id, b.to_wallet_id, b.category_id, b.note, b.tags, b.date, b.time, b.status, ctx.user.id, recurringId).lastInsertRowid);
      log(ctx, `${ctx.user.name} added ${b.type} ${money(b.amount_cents, ctx.space)}${b.note ? ' · ' + b.note : ''}`);
      return { id, _status: 201 };
    });
  });
  route('GET', '/api/transactions/:id', {}, (ctx) => {
    const t = db.prepare(`${TX_SELECT} WHERE t.id=? AND t.space_id=?`).get(ctx.params.id, ctx.space.id); if (!t) throw new HttpError(404, 'Not found');
    const similar = t.category_id ? db.prepare(`${TX_SELECT} WHERE t.space_id=? AND t.category_id=? AND t.id<>? AND t.type=? ORDER BY t.date DESC,t.id DESC LIMIT 3`).all(ctx.space.id, t.category_id, t.id, t.type).map(M.shapeTx) : [];
    let impact = null;
    if (t.type === 'expense' && t.category_id) {
      const b = db.prepare('SELECT * FROM budgets WHERE space_id=? AND category_id=? ORDER BY id LIMIT 1').get(ctx.space.id, t.category_id);
      if (b) { const win = D.periodWindow(b.period, t.date, ctx.space.week_start); const spent = db.prepare(`SELECT COALESCE(SUM(amount_cents),0) s FROM transactions WHERE space_id=? AND type='expense' AND category_id=? AND date>=? AND date<=?`).get(ctx.space.id, t.category_id, win.start, win.end).s;
        impact = { limit_cents: b.amount_cents, after_pct: spent / b.amount_cents, before_pct: (spent - t.amount_cents) / b.amount_cents }; }
    }
    return { ...M.shapeTx(t), similar, budget_impact: impact };
  });
  route('PATCH', '/api/transactions/:id', {}, (ctx) => {
    const ex = db.prepare('SELECT * FROM transactions WHERE id=? AND space_id=?').get(ctx.params.id, ctx.space.id); if (!ex) throw new HttpError(404, 'Not found');
    const b = txBody(ctx, ctx.body, ex);
    db.prepare(`UPDATE transactions SET type=?,amount_cents=?,wallet_id=?,to_wallet_id=?,category_id=?,note=?,tags=?,date=?,time=?,status=?,updated_at=datetime('now') WHERE id=?`)
      .run(b.type, b.amount_cents, b.wallet_id, b.to_wallet_id, b.category_id, b.note, b.tags, b.date, b.time, b.status, ex.id);
    log(ctx, `${ctx.user.name} edited ${b.type} ${money(b.amount_cents, ctx.space)}`); return { ok: true };
  });
  route('DELETE', '/api/transactions/:id', {}, (ctx) => {
    const ex = db.prepare('SELECT * FROM transactions WHERE id=? AND space_id=?').get(ctx.params.id, ctx.space.id); if (!ex) throw new HttpError(404, 'Not found');
    db.prepare('DELETE FROM transactions WHERE id=?').run(ex.id); log(ctx, `${ctx.user.name} deleted ${ex.type} ${money(ex.amount_cents, ctx.space)}`); return { ok: true };
  });

  // budgets
  route('GET', '/api/budgets', {}, (ctx) => budgetsOverviewFor(ctx));
  const budgetsOverviewFor = (ctx) => { const today = D.todayIn(ctx.space.tz); return { ...M.budgetsOverview(db, ctx.space.id, today, ctx.query.mode === 'all' ? 'all' : 'period', ctx.space.week_start), today }; };
  route('POST', '/api/budgets', {}, (ctx) => {
    const b = ctx.body; const cat = db.prepare(`SELECT * FROM categories WHERE id=? AND space_id=? AND kind='expense'`).get(b.category_id, ctx.space.id); if (!cat) throw bad('Choose a category');
    if (db.prepare('SELECT 1 FROM budgets WHERE space_id=? AND category_id=?').get(ctx.space.id, cat.id)) throw bad('That category already has a budget');
    const start = b.start_date || D.monthStart(D.todayIn(ctx.space.tz)); if (!D.isDate(start)) throw bad('Invalid start date');
    const id = db.prepare('INSERT INTO budgets(space_id,category_id,amount_cents,period,rollover,start_date,created_by) VALUES(?,?,?,?,?,?,?)')
      .run(ctx.space.id, cat.id, cents(b.amount_cents), oneOf(b.period || 'monthly', PERIODS, 'period'), b.rollover ? 1 : 0, start, ctx.user.id).lastInsertRowid;
    log(ctx, `${ctx.user.name} set a ${cat.name} budget`); return { id: Number(id), _status: 201 };
  });
  route('PATCH', '/api/budgets/:id', {}, (ctx) => {
    const ex = db.prepare('SELECT * FROM budgets WHERE id=? AND space_id=?').get(ctx.params.id, ctx.space.id); if (!ex) throw new HttpError(404, 'Not found');
    db.prepare('UPDATE budgets SET amount_cents=?,period=?,rollover=? WHERE id=?').run(ctx.body.amount_cents !== undefined ? cents(ctx.body.amount_cents) : ex.amount_cents,
      oneOf(ctx.body.period ?? ex.period, PERIODS, 'period'), ctx.body.rollover === undefined ? ex.rollover : ctx.body.rollover ? 1 : 0, ex.id); return { ok: true };
  });
  route('DELETE', '/api/budgets/:id', {}, (ctx) => {
    if (!db.prepare('DELETE FROM budgets WHERE id=? AND space_id=?').run(ctx.params.id, ctx.space.id).changes) throw new HttpError(404, 'Not found'); return { ok: true };
  });

  route('GET', '/api/summary', {}, (ctx) => { const today = D.todayIn(ctx.space.tz); M.runRecurring(db, ctx.space.id, today); return M.summary(db, ctx.space, today); });
  route('GET', '/api/analytics', {}, (ctx) => {
    const q = ctx.query;
    return M.analytics(db, ctx.space, D.todayIn(ctx.space.tz), { period: q.period, date: q.date, kind: ['income', 'net'].includes(q.kind) ? q.kind : 'expense', category: q.category, member: q.member });
  });
  route('GET', '/api/recurring', {}, (ctx) => ({ items: db.prepare('SELECT * FROM recurring WHERE space_id=? AND active=1 ORDER BY next_date').all(ctx.space.id) }));
  route('DELETE', '/api/recurring/:id', {}, (ctx) => { db.prepare('UPDATE recurring SET active=0 WHERE id=? AND space_id=?').run(ctx.params.id, ctx.space.id); return { ok: true }; });

  // investments (manual prices: the app never calls a market-data service)
  const invBody = (b, ex) => ({
    symbol: str(b.symbol ?? ex?.symbol, 12).toUpperCase() || (() => { throw bad('Symbol required'); })(), name: str(b.name ?? ex?.name, 60),
    kind: oneOf(b.kind ?? ex?.kind ?? 'stock', KINDS, 'kind'),
    quantity: (() => { const q = Number(b.quantity ?? ex?.quantity); if (!(q > 0)) throw bad('Quantity must be positive'); return q; })(),
    cost_cents: Number.isInteger(b.cost_cents ?? ex?.cost_cents ?? 0) ? (b.cost_cents ?? ex?.cost_cents ?? 0) : (() => { throw bad('Invalid cost'); })(),
    price_cents: cents(b.price_cents ?? ex?.price_cents),
  });
  route('GET', '/api/portfolio', {}, (ctx) => M.portfolio(db, ctx.space.id));
  route('POST', '/api/investments', {}, (ctx) => {
    const i = invBody(ctx.body);
    const id = db.prepare('INSERT INTO investments(space_id,symbol,name,kind,quantity,cost_cents,price_cents,prev_price_cents,created_by) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(ctx.space.id, i.symbol, i.name, i.kind, i.quantity, i.cost_cents, i.price_cents, i.price_cents, ctx.user.id).lastInsertRowid; return { id: Number(id), _status: 201 };
  });
  route('PATCH', '/api/investments/:id', {}, (ctx) => {
    const ex = db.prepare('SELECT * FROM investments WHERE id=? AND space_id=?').get(ctx.params.id, ctx.space.id); if (!ex) throw new HttpError(404, 'Not found');
    const i = invBody(ctx.body, ex);
    db.prepare(`UPDATE investments SET symbol=?,name=?,kind=?,quantity=?,cost_cents=?,price_cents=?,prev_price_cents=?,price_updated_at=datetime('now') WHERE id=?`)
      .run(i.symbol, i.name, i.kind, i.quantity, i.cost_cents, i.price_cents, i.price_cents !== ex.price_cents ? ex.price_cents : ex.prev_price_cents, ex.id); return { ok: true };
  });
  route('DELETE', '/api/investments/:id', {}, (ctx) => { db.prepare('DELETE FROM investments WHERE id=? AND space_id=?').run(ctx.params.id, ctx.space.id); return { ok: true }; });

  // shared account
  route('PATCH', '/api/space', {}, (ctx) => {
    const b = ctx.body;
    const ws = b.week_start === undefined ? ctx.space.week_start : Number(b.week_start);
    if (!Number.isInteger(ws) || ws < 0 || ws > 6) throw bad('Invalid week start');
    db.prepare('UPDATE spaces SET name=?,currency=?,tz=?,week_start=? WHERE id=?').run(str(b.name ?? ctx.space.name, 60) || ctx.space.name,
      /^[A-Z]{3}$/.test(b.currency || '') ? b.currency : ctx.space.currency, b.tz ? validTz(b.tz) : ctx.space.tz, ws, ctx.space.id); return { ok: true };
  });
  route('POST', '/api/space/invite/regenerate', {}, (ctx) => { const code = newCode(); db.prepare('UPDATE spaces SET invite_code=? WHERE id=?').run(code, ctx.space.id); return { invite_code: code }; });
  route('POST', '/api/space/members', {}, (ctx) => {
    requireOwner(ctx);
    const n = str(ctx.body.name, 60), e = str(ctx.body.email, 200).toLowerCase(), pw = ctx.body.password;
    if (!n) throw bad('Please enter a name'); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw bad('Please enter a valid email');
    if (typeof pw !== 'string' || pw.length < 8) throw bad('Password must be at least 8 characters');
    if (members(ctx.space.id).length >= MAX_MEMBERS) throw bad(`This account is full (max ${MAX_MEMBERS} people)`);
    if (db.prepare('SELECT 1 FROM users WHERE email=?').get(e)) throw bad('An account with this email already exists');
    const { salt, hash } = A.hashPassword(pw);
    const id = inTx(db, () => { const uid = Number(db.prepare('INSERT INTO users(email,name,pw_hash,pw_salt) VALUES(?,?,?,?)').run(e, n, hash, salt).lastInsertRowid); joinSpace(uid, ctx.space.invite_code); return uid; });
    log(ctx, `${ctx.user.name} added ${n}`); return { id, _status: 201 };
  });
  route('DELETE', '/api/space/members/:id', {}, (ctx) => {
    requireOwner(ctx); const uid = Number(ctx.params.id);
    if (uid === ctx.user.id) throw bad('You cannot remove yourself'); const m = members(ctx.space.id).find((x) => x.id === uid); if (!m) throw new HttpError(404, 'Not found');
    inTx(db, () => { db.prepare('DELETE FROM members WHERE user_id=?').run(uid); db.prepare('DELETE FROM sessions WHERE user_id=?').run(uid); createSpaceFor(uid, `${m.name.split(' ')[0]}'s budget`, ctx.space.tz); });
    log(ctx, `${ctx.user.name} removed ${m.name}`); return { ok: true };
  });
  route('POST', '/api/space/join', {}, (ctx) => {
    const cur = ctx.space; const hasData = db.prepare('SELECT COUNT(*) c FROM transactions WHERE space_id=?').get(cur.id).c || db.prepare('SELECT COUNT(*) c FROM wallets WHERE space_id=?').get(cur.id).c;
    if (members(cur.id).length > 1) throw bad('Leave your shared account first');
    if (hasData) throw bad('Your current account already has data. Join with a code when signing up, or delete your data first.');
    const target = inTx(db, () => { db.prepare('DELETE FROM members WHERE user_id=?').run(ctx.user.id); db.prepare('DELETE FROM spaces WHERE id=?').run(cur.id); return joinSpace(ctx.user.id, ctx.body.code); });
    db.prepare('INSERT INTO activity(space_id,user_id,text) VALUES(?,?,?)').run(target.id, ctx.user.id, `${ctx.user.name} joined`); publish(target.id); return { ok: true };
  });
  route('DELETE', '/api/space/data', {}, (ctx) => {
    inTx(db, () => { for (const t of ['transactions', 'budgets', 'recurring', 'investments', 'activity', 'wallets']) db.prepare(`DELETE FROM ${t} WHERE space_id=?`).run(ctx.space.id); });
    log(ctx, `${ctx.user.name} deleted all data`); return { ok: true };
  });
  route('GET', '/api/activity', {}, (ctx) => ({ items: db.prepare('SELECT a.id,a.text,a.ts,u.name user_name FROM activity a LEFT JOIN users u ON u.id=a.user_id WHERE a.space_id=? ORDER BY a.id DESC LIMIT 60').all(ctx.space.id) }));
  route('GET', '/api/export.csv', {}, (ctx) => {
    const esc = (v) => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const rows = db.prepare(`${TX_SELECT} WHERE t.space_id=? ORDER BY t.date,t.time,t.id`).all(ctx.space.id);
    const out = ['date,time,type,amount,wallet,to_wallet,category,note,tags,by'];
    for (const t of rows) out.push([t.date, t.time, t.type, (t.amount_cents / 100).toFixed(2), t.wallet_name, t.to_wallet_name, t.cat_name, t.note, JSON.parse(t.tags).join(' '), t.user_name].map(esc).join(','));
    return { raw: out.join('\n'), type: 'text/csv; charset=utf-8', headers: { 'Content-Disposition': 'attachment; filename="duet-export.csv"' } };
  });
  route('GET', '/api/events', {}, (ctx) => ({ stream: true }));

  // ---------- http plumbing ----------
  async function readBody(req) {
    const chunks = []; let size = 0;
    for await (const c of req) { size += c.length; if (size > 1_000_000) throw new HttpError(413, 'Body too large'); chunks.push(c); }
    if (!size) return {};
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw bad('Invalid JSON'); }
  }
  async function handleApi(req, res, url) {
    const send = (status, obj, headers = {}) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers }); res.end(JSON.stringify(obj)); };
    try {
      const r = routes.find((x) => x.method === req.method && x.re.test(url.pathname));
      if (!r) throw new HttpError(404, 'Not found');
      if (req.method !== 'GET') {
        const origin = req.headers.origin;
        if (origin && new URL(origin).host !== req.headers.host) throw new HttpError(403, 'Cross-origin request blocked');
      }
      const ctx = { params: r.re.exec(url.pathname).groups || {}, query: Object.fromEntries(url.searchParams), ip: req.socket.remoteAddress || '', body: {} };
      if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) ctx.body = await readBody(req);
      ctx.token = A.parseCookies(req.headers.cookie).duet_session;
      if (r.auth) {
        ctx.user = A.userForToken(db, ctx.token); if (!ctx.user) throw new HttpError(401, 'Please sign in');
        ctx.space = getSpace(ctx.user.id); if (!ctx.space) throw new HttpError(409, 'No shared account');
      }
      const out = r.fn(ctx);
      if (out.stream) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
        res.write('retry: 3000\n\n');
        const set = streams.get(ctx.space.id) || new Set(); set.add(res); streams.set(ctx.space.id, set);
        const ping = setInterval(() => res.write(': ping\n\n'), 25000);
        req.on('close', () => { clearInterval(ping); set.delete(res); });
        return;
      }
      if (out.raw !== undefined) { res.writeHead(200, { 'Content-Type': out.type, ...out.headers }); return res.end(out.raw); }
      const headers = {};
      if (out.token) headers['Set-Cookie'] = A.sessionCookie(out.token, secureCookies);
      if (out.clear) headers['Set-Cookie'] = A.clearCookie;
      const { _status = 200, token, clear, ...payload } = out;
      if (req.method !== 'GET' && ctx.space) publish(ctx.space.id);
      send(_status, payload, headers);
    } catch (e) {
      if (e instanceof HttpError) return send(e.status, { error: e.message });
      if (e?.code === 'ERR_SQLITE_ERROR') { console.error(e); return send(400, { error: 'Could not save that change' }); }
      console.error(e); send(500, { error: 'Something went wrong' });
    }
  }
  async function handleStatic(req, res, url) {
    let p = decodeURIComponent(url.pathname); if (p === '/') p = '/index.html';
    const file = normalize(join(ROOT, 'public', p));
    if (!file.startsWith(join(ROOT, 'public'))) { res.writeHead(403); return res.end(); }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Cache-Control': p === '/sw.js' ? 'no-cache' : 'no-cache' });
      res.end(body);
    } catch {
      try { const body = await readFile(join(ROOT, 'public', 'index.html')); res.writeHead(200, { 'Content-Type': MIME['.html'] }); res.end(body); }
      catch { res.writeHead(404); res.end('Not found'); }
    }
  }
  const server = http.createServer((req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'");
    const url = new URL(req.url, 'http://x');
    (url.pathname.startsWith('/api/') ? handleApi : handleStatic)(req, res, url);
  });
  return { server, db, close: () => { for (const s of streams.values()) for (const r of s) r.end(); server.close(); db.close(); } };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000), host = process.env.HOST || '0.0.0.0';
  const app = createApp();
  app.server.listen(port, host, () => console.log(`Duet Budget running → http://localhost:${port}  (LAN: bind HOST=${host})`));
  setInterval(() => { // nightly-ish: materialise recurring rules for every space
    for (const s of app.db.prepare('SELECT id,tz FROM spaces').all()) M.runRecurring(app.db, s.id, D.todayIn(s.tz));
  }, 60 * 60 * 1000).unref();
}
