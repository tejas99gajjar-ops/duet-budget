// Usage: node scripts/reset-password.js you@example.com 'new-password'   (run on the server, with the app stopped or running)
import { openDb } from '../lib/db.js';
import { hashPassword } from '../lib/auth.js';
const [email, pw] = process.argv.slice(2);
if (!email || !pw || pw.length < 8) { console.error('Usage: node scripts/reset-password.js <email> <new-password (8+ chars)>'); process.exit(1); }
const db = openDb(process.env.DATABASE_FILE || new URL('../data/duet.db', import.meta.url).pathname);
const u = db.prepare('SELECT id FROM users WHERE email=?').get(email);
if (!u) { console.error('No such user'); process.exit(1); }
const { salt, hash } = hashPassword(pw);
db.prepare('UPDATE users SET pw_hash=?,pw_salt=? WHERE id=?').run(hash, salt, u.id);
db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id);
console.log('Password updated; all sessions signed out.');
