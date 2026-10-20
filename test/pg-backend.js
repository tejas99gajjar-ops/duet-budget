// Test double for public/js/backend.js: the REAL supabase/schema.sql (tables, RLS, functions) running in PGlite,
// with each call executed as the "authenticated" role for a given user id, like PostgREST would.
// Environment-neutral (Node tests and the browser harness): callers pass in PGlite and the schema text.
export async function createDbWith(PGlite, types, schemaSql) {
  const db = new PGlite({ parsers: { [types.DATE]: (v) => v, [types.TIME]: (v) => v, [types.TIMESTAMPTZ]: (v) => v, [types.NUMERIC]: (v) => Number(v) } });
  await db.exec(`create role anon nologin; create role authenticated nologin;
    create schema auth; create table auth.users(id uuid primary key default gen_random_uuid(), email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
    grant usage on schema auth to authenticated; grant usage on schema public to anon, authenticated; create publication supabase_realtime;`);
  await db.exec(schemaSql);
  return db;
}
const IDENT = /^[a-z_]+$/;
export function pgBackend(db, email = 'me@x.io', name = 'Me') {
  let uid = null, offline = false;
  const as = async (fn) => {
    if (offline) { const e = new Error('You appear to be offline'); e.offline = true; throw e; }
    await db.exec(`reset role; set request.jwt.claim.sub='${uid}'; set role authenticated;`);
    try { return await fn(); } catch (e) { throw new Error(String(e.message).replace(/^.*?(violates|Only|That|Your|You |Leave)/, '$1')); } finally { await db.exec('reset role'); }
  };
  const ensureUser = async () => { if (uid) return; const r = await db.query('select id from auth.users where email=$1', [email]); uid = r.rows[0]?.id || (await db.query('insert into auth.users(email) values ($1) returning id', [email])).rows[0].id; };
  const user = () => ({ id: uid, email, name });
  return {
    setOffline: (v) => { offline = v; },
    auth: { async getSession() { await ensureUser(); return user(); }, async signUp() { await ensureUser(); return user(); }, async signIn() { await ensureUser(); return user(); }, async signOut() {}, async changePassword() {}, onSignedOut() {} },
    async fetchAll(table) { return as(async () => (await db.query(`select * from public.${table} order by ${table === 'members' ? 'joined_at' : table === 'spaces' ? 'created_at' : 'id'}`)).rows); },
    async insert(table, row) { return as(async () => { const k = Object.keys(row); return (await db.query(`insert into public.${table} (${k.join(',')}) values (${k.map((_, i) => '$' + (i + 1)).join(',')}) returning *`, k.map((x) => row[x]))).rows[0]; }); },
    async update(table, match, patch) { return as(async () => { const pk = Object.keys(patch), mk = Object.keys(match); const r = await db.query(`update public.${table} set ${pk.map((c, i) => `${c}=$${i + 1}`).join(',')} where ${mk.map((c, i) => `${c}=$${pk.length + i + 1}`).join(' and ')} returning *`, [...pk.map((c) => patch[c]), ...mk.map((c) => match[c])]); if (!r.rows.length) throw new Error('Not allowed or not found'); return r.rows[0]; }); },
    async remove(table, match) { return as(async () => { const mk = Object.keys(match); await db.query(`delete from public.${table} where ${mk.map((c, i) => `${c}=$${i + 1}`).join(' and ')}`, mk.map((c) => match[c])); }); },
    async rpc(fn, args = {}) { if (!IDENT.test(fn)) throw new Error('bad fn'); return as(async () => { const k = Object.keys(args); const r = await db.query(`select public.${fn}(${k.map((c, i) => `${c} => $${i + 1}`).join(',')}) as v`, k.map((c) => args[c])); return r.rows[0].v; }); },
    subscribe() { return () => {}; },
  };
}
