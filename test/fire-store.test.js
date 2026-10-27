// FIRE data layer against the real SQL (PGlite): create, edit by section, undo, offline queue, snapshots, sharing, isolation.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { createDb, pgBackend } = await import('./pg-node.js');
const { createDbWith } = await import('./pg-backend.js');
const { PGlite, types } = await import('@electric-sql/pglite');
const db = await createDb();
const bare = await createDbWith(PGlite, types, readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));   // a project that has not run fire.sql
globalThis.window = { dispatchEvent() {}, addEventListener() {} };
const S = await import('../public/js/store.js');
const F = await import('../public/js/fire/store.js');
const { defaultPlan } = await import('../public/js/fire/defaults.js');

let be;
before(async () => {
  be = pgBackend(db, 'a@x.io', 'Tejas'); S.configure(be); S.state.user = await be.auth.signUp();
  await be.rpc('create_space', { p_name: 'T', p_user_name: 'Tejas', p_tz: 'UTC' }); await S.init();
});
const row = async () => (await db.query('select * from fire_plans')).rows[0];

test('before setup there is no plan; creating one stores every section', async () => {
  await F.load(); assert.equal(F.fs.plan, null); assert.equal(F.fs.needsSetup, false);
  const p = defaultPlan({ today: '2026-10-27', name: "Tejas's Plan" }); p.profile.people[0].name = 'Tejas';
  await F.createPlan(p, "Tejas's Plan");
  const r = await row(); assert.equal(r.name, "Tejas's Plan"); assert.equal(r.profile.people[0].name, 'Tejas'); assert.equal(r.goals[0].kind, 'retirement');
});

test('editing a section saves only that section; undo restores it', async () => {
  F.edit('holdings', (h) => [...h, { id: 'h1', name: 'Nifty fund', kind: 'mf', assetClass: 'equity', value: 100000, sips: [] }], { immediate: true });
  await F.flush(); assert.equal((await row()).holdings.length, 1); assert.equal(F.unsent(), 0);
  const goalsBefore = (await row()).goals;
  F.edit('loans', () => [{ id: 'l1', name: 'Car', outstanding: 643581, ratePct: 8.5, emi: 24687 }], { immediate: true }); await F.flush();
  assert.deepEqual((await row()).goals, goalsBefore, 'other sections untouched');
  F.undo(); await new Promise((r) => setTimeout(r, 250)); await F.flush(); assert.equal((await row()).loans.length, 0, 'undo removed the loan');
});

test('offline edits are queued and sent when the connection returns', async () => {
  be.setOffline(true);
  F.edit('incomes', () => [{ id: 'i1', person: 'p1', label: 'Salary', takeHome: 186000 }], { immediate: true }); await F.flush();
  assert.equal(F.unsent(), 1); assert.equal((await row()).incomes.length, 0, 'not on the server yet');
  be.setOffline(false); await F.flush(); assert.equal(F.unsent(), 0); assert.equal((await row()).incomes[0].takeHome, 186000);
});

test('a plan rename and the last Monte Carlo result persist', async () => {
  F.rename('Our FIRE Plan'); await F.flush(); assert.equal((await row()).name, 'Our FIRE Plan');
  await F.saveMc({ success: 0.71, paths: 10000 }); assert.equal((await row()).mc_last.success, 0.71);
});

test('snapshots: take, list newest first, restore and delete', async () => {
  const s1 = await F.takeSnapshot('October 2026', 'first', { netWorth: 1 });
  F.edit('goals', (g) => [...g, { id: 'g2', kind: 'custom', name: 'Trip', target: 1 }], { immediate: true }); await F.flush();
  const s2 = await F.takeSnapshot('Later');
  assert.equal(F.fs.snapshots[0].id, s2.id);
  await F.restoreSnapshot(s1.id); assert.equal((await row()).goals.length, 1, 'restored the earlier goals');
  await F.deleteSnapshot(s2.id); assert.equal((await db.query('select count(*)::int n from fire_snapshots')).rows[0].n, 1);
});

test('both people share the plan; an outsider cannot see or write it; existing data is untouched', async () => {
  const code = (await be.fetchAll('spaces'))[0].invite_code;
  const partner = pgBackend(db, 'p@x.io', 'Partner'); await partner.auth.signUp(); await partner.rpc('join_space', { p_code: code, p_user_name: 'Partner' });
  assert.equal((await partner.fetchAll('fire_plans')).length, 1);
  await partner.update('fire_plans', { id: (await row()).id }, { name: 'Edited by partner' }); assert.equal((await row()).name, 'Edited by partner');
  const eve = pgBackend(db, 'e@x.io', 'Eve'); await eve.auth.signUp(); assert.equal((await eve.fetchAll('fire_plans')).length, 0);
  await assert.rejects(eve.insert('fire_plans', { space_id: (await be.fetchAll('spaces'))[0].id, name: 'x' }), /row-level security|violates/);
  assert.equal((await be.fetchAll('wallets')).length, 0);
});

test('without the SQL file the app reports "setup needed" instead of failing', async () => {
  const b2 = pgBackend(bare, 'z@x.io', 'Z'); await b2.auth.signUp();
  await assert.rejects(b2.fetchAll('fire_plans'));                 // the raw call fails...
  S.configure(b2); S.state.user = await b2.auth.signUp(); await b2.rpc('create_space', { p_name: 'Z', p_user_name: 'Z', p_tz: 'UTC' }); await S.init();
  F.fs.loaded = false; F.fs.plan = null; await F.load({ force: true }); assert.equal(F.fs.needsSetup, true);   // ...and the planner turns it into a friendly state
});
