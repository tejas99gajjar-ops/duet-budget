import { scryptSync, randomBytes, timingSafeEqual, createHash } from 'node:crypto';

export const hashPassword = (pw, salt = randomBytes(16).toString('hex')) =>
  ({ salt, hash: scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex') });
export function verifyPassword(pw, salt, hash) {
  const a = Buffer.from(hashPassword(pw, salt).hash, 'hex'), b = Buffer.from(hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
const sha = (s) => createHash('sha256').update(s).digest('hex');
const SESSION_MS = 1000 * 60 * 60 * 24 * 60;

export function createSession(db, userId) {
  const token = randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(sha(token), userId, Date.now() + SESSION_MS);
  return token;
}
export function userForToken(db, token) {
  if (!token) return null;
  const row = db.prepare(`SELECT u.id,u.email,u.name,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?`).get(sha(token));
  if (!row) return null;
  if (row.expires_at < Date.now()) { destroySession(db, token); return null; }
  return { id: row.id, email: row.email, name: row.name };
}
export const destroySession = (db, token) => db.prepare('DELETE FROM sessions WHERE token_hash=?').run(sha(token));
export const destroyUserSessions = (db, userId, exceptToken) =>
  db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash<>?').run(userId, exceptToken ? sha(exceptToken) : '');

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) { const i = part.indexOf('='); if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); }
  return out;
}
export const sessionCookie = (token, secure) =>
  `duet_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MS / 1000}${secure ? '; Secure' : ''}`;
export const clearCookie = 'duet_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';

/** Tiny in-memory throttle for credential endpoints. */
export function makeLimiter(max, windowMs) {
  const hits = new Map();
  return (key) => {
    const now = Date.now(); const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
    arr.push(now); hits.set(key, arr);
    return arr.length <= max;
  };
}
