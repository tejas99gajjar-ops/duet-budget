import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, name TEXT NOT NULL,
  pw_hash TEXT NOT NULL, pw_salt TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS sessions(
  token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS spaces(
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, currency TEXT NOT NULL DEFAULT 'USD', tz TEXT NOT NULL DEFAULT 'UTC',
  invite_code TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS members(
  space_id INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  color TEXT NOT NULL DEFAULT '#1DDB97', joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(space_id,user_id));
CREATE TABLE IF NOT EXISTS wallets(
  id INTEGER PRIMARY KEY, space_id INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL, type TEXT NOT NULL, color TEXT NOT NULL, initial_cents INTEGER NOT NULL DEFAULT 0,
  archived INTEGER NOT NULL DEFAULT 0, created_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS categories(
  id INTEGER PRIMARY KEY, space_id INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL, icon TEXT NOT NULL, kind TEXT NOT NULL, color TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS transactions(
  id INTEGER PRIMARY KEY, space_id INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  type TEXT NOT NULL, amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  wallet_id INTEGER NOT NULL, to_wallet_id INTEGER, category_id INTEGER,
  note TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '[]', date TEXT NOT NULL, time TEXT NOT NULL DEFAULT '12:00',
  status TEXT NOT NULL DEFAULT 'cleared', created_by INTEGER, recurring_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS tx_space_date ON transactions(space_id, date DESC, time DESC);
CREATE INDEX IF NOT EXISTS tx_wallet ON transactions(wallet_id);
CREATE TABLE IF NOT EXISTS budgets(
  id INTEGER PRIMARY KEY, space_id INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL, amount_cents INTEGER NOT NULL CHECK(amount_cents > 0), period TEXT NOT NULL DEFAULT 'monthly',
  rollover INTEGER NOT NULL DEFAULT 0, start_date TEXT NOT NULL, created_by INTEGER);
CREATE TABLE IF NOT EXISTS recurring(
  id INTEGER PRIMARY KEY, space_id INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  type TEXT NOT NULL, amount_cents INTEGER NOT NULL, wallet_id INTEGER NOT NULL, to_wallet_id INTEGER, category_id INTEGER,
  note TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '[]', frequency TEXT NOT NULL, next_date TEXT NOT NULL,
  time TEXT NOT NULL DEFAULT '12:00', active INTEGER NOT NULL DEFAULT 1, created_by INTEGER);
CREATE TABLE IF NOT EXISTS investments(
  id INTEGER PRIMARY KEY, space_id INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL, name TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL, quantity REAL NOT NULL,
  cost_cents INTEGER NOT NULL DEFAULT 0, price_cents INTEGER NOT NULL, prev_price_cents INTEGER NOT NULL,
  price_updated_at TEXT NOT NULL DEFAULT (datetime('now')), created_by INTEGER);
CREATE TABLE IF NOT EXISTS activity(
  id INTEGER PRIMARY KEY, space_id INTEGER NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  user_id INTEGER, text TEXT NOT NULL, ts TEXT NOT NULL DEFAULT (datetime('now')));
`;

export function openDb(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  db.exec(SCHEMA);
  const cols = db.prepare('PRAGMA table_info(spaces)').all().map((c) => c.name);
  if (!cols.includes('week_start')) db.exec('ALTER TABLE spaces ADD COLUMN week_start INTEGER NOT NULL DEFAULT 0');
  return db;
}
export function tx(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}
