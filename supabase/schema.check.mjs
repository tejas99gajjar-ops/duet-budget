// Dev-only check: runs schema.sql in PGlite (WASM Postgres) with stubbed Supabase auth and asserts the RLS rules.
// Needs `npm i @electric-sql/pglite` (not a runtime dependency).
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
const db = new PGlite();
await db.exec(`
create role anon nologin; create role authenticated nologin; create role service_role nologin;
create schema auth; create table auth.users(id uuid primary key default gen_random_uuid(), email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
grant usage on schema auth to authenticated; grant usage on schema public to anon, authenticated;
create publication supabase_realtime;`);
await db.exec(readFileSync(new URL('./schema.sql', import.meta.url),'utf8'));
console.log('schema applied');
const as = async (uid, sql, params) => { await db.exec(`reset role; set request.jwt.claim.sub='${uid}'; set role authenticated;`); return db.query(sql, params); };
const A = (await db.query(`insert into auth.users(email) values ('a@x.io') returning id`)).rows[0].id;
const B = (await db.query(`insert into auth.users(email) values ('b@x.io') returning id`)).rows[0].id;
const C = (await db.query(`insert into auth.users(email) values ('c@x.io') returning id`)).rows[0].id;
const sid = (await as(A, `select create_space('Tejas shared','Tejas','UTC') s`)).rows[0].s;
const code = (await as(A, `select invite_code from spaces`)).rows[0].invite_code;
await as(B, `select join_space($1,'Alex')`, [code]);
console.log('members seen by B:', (await as(B, `select name from members order by joined_at`)).rows.map(r=>r.name));
const w = (await as(A, `insert into wallets(space_id,name,type,initial_cents) values ($1,'Main','bank',100000) returning id`, [sid])).rows[0].id;
const cat = (await as(B, `select id from categories where name='Groceries'`)).rows[0].id;
await as(B, `insert into transactions(space_id,type,amount_cents,wallet_id,category_id,date,note) values ($1,'expense',8420,$2,$3,current_date,'Whole Foods')`, [sid, w, cat]);
console.log('A sees tx by B:', (await as(A, `select note,amount_cents,created_by=$1 as by_b from transactions`, [B])).rows);
console.log('activity:', (await as(A, `select text from activity order by id`)).rows.map(r=>r.text));
// isolation: outsider C has no space
await as(C, `select 1`);
console.log('C sees spaces:', (await as(C, `select count(*)::int n from spaces`)).rows[0].n, 'wallets:', (await as(C, `select count(*)::int n from wallets`)).rows[0].n);
const fail = async (label, fn) => { try { await fn(); console.log('!! SHOULD HAVE FAILED:', label); } catch (e) { console.log('blocked ✔', label, '→', e.message.slice(0, 70)); } };
await fail('C inserts into A space', () => as(C, `insert into wallets(space_id,name,type) values ($1,'x','bank')`, [sid]));
await fail('B reads/edits owner_id', () => as(B, `update spaces set owner_id=$1`, [B]));
await fail('B removes member (not owner)', () => as(B, `select remove_member($1)`, [A]));
await fail('C joins then foreign wallet ref', async () => { const s2 = (await as(C, `select create_space('C','C','UTC') s`)).rows[0].s; await as(C, `insert into transactions(space_id,type,amount_cents,wallet_id,date) values ($1,'expense',1,$2,current_date)`, [s2, w]); });
await fail('anon access', async () => { await db.exec(`reset role; set role anon`); await db.query('select * from transactions'); });
await fail('negative amount', () => as(A, `insert into transactions(space_id,type,amount_cents,wallet_id,date) values ($1,'expense',-5,$2,current_date)`, [sid, w]));
await fail('full account (max 6) -> set max 2', async () => { await db.exec(`reset role; update spaces set max_members=2`); const D = (await db.query(`insert into auth.users(email) values ('d@x.io') returning id`)).rows[0].id; await as(D, `select join_space($1,'D')`, [code]); });
// recurring
await db.exec(`reset role; update spaces set max_members=6`);
await as(A, `insert into recurring(space_id,type,amount_cents,wallet_id,frequency,next_date,note) values ($1,'expense',999,$2,'monthly',current_date - 65,'Sub')`, [sid, w]);
console.log('recurring created:', (await as(A, `select run_recurring() n`)).rows[0].n, 'again:', (await as(A, `select run_recurring() n`)).rows[0].n);
// owner ops
await as(A, `select remove_member($1)`, [B]); console.log('after remove, members:', (await as(A, `select count(*)::int n from members`)).rows[0].n);
await as(A, `select wipe_data()`); console.log('after wipe tx:', (await as(A, `select count(*)::int n from transactions`)).rows[0].n);
console.log('published tables:', (await db.query(`select count(*)::int n from pg_publication_tables where pubname='supabase_realtime'`)).rows[0].n);
