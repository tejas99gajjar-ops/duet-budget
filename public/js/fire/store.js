// FIRE planner data layer: one plan per shared account, stored section by section so two people editing different
// sections never overwrite each other. Works offline (changes are kept on the device and sent later) and live-syncs.
import { state as app } from '../store.js';
import { defaultPlan, normalizePlan } from './defaults.js';

export const SECTIONS = ['profile', 'incomes', 'spending', 'holdings', 'loans', 'insurance', 'events', 'goals', 'scenarios', 'assumptions', 'settings'];
export const fs = { loaded: false, loading: false, needsSetup: false, error: null, row: null, plan: null, snapshots: [], mc: null, saving: false, lastSaved: null, pending: new Set(), history: [], online: true };

const listeners = new Set();
export const onFire = (cb) => { listeners.add(cb); return () => listeners.delete(cb); };
const emit = (evt = 'change') => { for (const cb of listeners) try { cb(evt); } catch (e) { console.error(e); } };

// ---- tiny IndexedDB cache (falls back to memory) ----
const mem = new Map();
const idb = () => new Promise((res, rej) => { if (typeof indexedDB === 'undefined') return rej(new Error('no idb')); const r = indexedDB.open('duet-fire', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const kv = {
  async get(k) { try { const db = await idb(); return await new Promise((res, rej) => { const r = db.transaction('kv').objectStore('kv').get(k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); } catch { return mem.get(k); } },
  async set(k, v) { mem.set(k, v); try { const db = await idb(); await new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); } catch {} },
};

const backend = () => app.backend;
const spaceId = () => app.data?.space?.id;
const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
const isMissingTable = (e) => /does not exist|could not find the table|schema cache|PGRST205|42P01/i.test(String(e?.message || e));

function rowToPlan(row) {
  const p = { name: row.name }; for (const s of SECTIONS) p[s] = row[s];
  if (p.spending && !Object.keys(p.spending).length) delete p.spending;
  return normalizePlan(Object.fromEntries(Object.entries(p).filter(([, v]) => !(v && typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length))));
}
const persistCache = () => kv.set('cache', { planId: fs.row?.id, plan: fs.plan, pending: [...fs.pending], mc: fs.mc });

export async function load({ force = false } = {}) {
  if (fs.loading) return fs; if (fs.loaded && !force) return fs;
  fs.loading = true; fs.error = null;
  try {
    const rows = await backend().fetchAll('fire_plans');
    fs.needsSetup = false; fs.row = rows[0] || null; fs.plan = fs.row ? rowToPlan(fs.row) : null; fs.mc = fs.row?.mc_last || null;
    fs.snapshots = (await backend().fetchAll('fire_snapshots')).sort((a, b) => String(b.taken_at).localeCompare(String(a.taken_at)));
    // keep any edits that are still waiting to be sent
    const cached = await kv.get('cache');
    if (cached && cached.planId === fs.row?.id && cached.pending?.length) for (const s of cached.pending) { if (cached.plan && s in cached.plan) { fs.plan[s] = cached.plan[s]; fs.pending.add(s); } }
    fs.online = true; fs.loaded = true; persistCache();
  } catch (e) {
    if (isMissingTable(e)) { fs.needsSetup = true; fs.loaded = true; }
    else if (e.offline) { const cached = await kv.get('cache'); if (cached?.plan) { fs.plan = normalizePlan(cached.plan); fs.row = { id: cached.planId }; fs.mc = cached.mc || null; fs.pending = new Set(cached.pending || []); fs.online = false; fs.loaded = true; } else fs.error = 'You are offline and there is no saved plan on this device yet.'; }
    else fs.error = e.message || String(e);
  } finally { fs.loading = false; }
  connect(); emit(); if (fs.pending.size) flush().catch(() => {}); return fs;
}

let unsub = null, refreshTimer = null;
function connect() {
  if (unsub || !backend() || !spaceId() || fs.needsSetup) return;
  try { unsub = backend().subscribe(spaceId(), () => { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => refreshFromServer().catch(() => {}), 250); }, () => {}, ['fire_plans', 'fire_snapshots']); } catch {}
}
export function disconnect() { unsub?.(); unsub = null; }
async function refreshFromServer() {
  if (fs.saving || fs.pending.size && fs.timers?.size) return;
  const rows = await backend().fetchAll('fire_plans'); const row = rows[0]; if (!row) return;
  const fresh = rowToPlan(row); for (const s of fs.pending) fresh[s] = fs.plan[s];          // my unsent edits win
  fs.row = row; fs.plan = fresh; fs.mc = row.mc_last || fs.mc;
  fs.snapshots = (await backend().fetchAll('fire_snapshots')).sort((a, b) => String(b.taken_at).localeCompare(String(a.taken_at)));
  persistCache(); emit('remote');
}

/** Creates the plan row for this account (once). */
export async function createPlan(plan = null, name) {
  const p = normalizePlan(plan || defaultPlan({ today: app.data?.today, name }));
  const row = { space_id: spaceId(), name: name || p.name || 'FIRE Plan' };
  for (const s of SECTIONS) row[s] = p[s];
  const saved = await backend().insert('fire_plans', row);
  fs.row = saved; fs.plan = rowToPlan(saved); fs.loaded = true; fs.needsSetup = false; persistCache(); connect(); emit(); return fs.plan;
}

// ---- editing: change a section, remember the old value for Undo, save shortly after ----
fs.timers = new Map();
export function edit(section, fn, { immediate = false, label = '', noUndo = false } = {}) {
  const old = clone(fs.plan[section]);
  const next = fn(clone(fs.plan[section]));
  fs.plan[section] = next === undefined ? fs.plan[section] : next;
  if (!noUndo) { fs.history.push({ section, old, label }); if (fs.history.length > 30) fs.history.shift(); }
  fs.pending.add(section); persistCache(); emit('edit');
  clearTimeout(fs.timers.get(section)); fs.timers.set(section, setTimeout(() => flush().catch(() => {}), immediate ? 0 : 500));
  return fs.plan[section];
}
export function editMany(patch, opts) { for (const [s, v] of Object.entries(patch)) edit(s, () => v, opts); }
export function rename(name) { fs.plan.name = name; fs.pending.add('__name'); persistCache(); emit('edit'); clearTimeout(fs.timers.get('__name')); fs.timers.set('__name', setTimeout(() => flush().catch(() => {}), 400)); }
export function undo() {
  const h = fs.history.pop(); if (!h) return null;
  fs.plan[h.section] = h.old; fs.pending.add(h.section); persistCache(); emit('edit');
  clearTimeout(fs.timers.get(h.section)); fs.timers.set(h.section, setTimeout(() => flush().catch(() => {}), 200)); return h;
}

/** Sends every changed section. A network failure keeps them queued; the next flush retries. */
export async function flush() {
  if (!fs.row?.id || !fs.pending.size || fs.saving) return;
  for (const t of fs.timers.values()) clearTimeout(t); fs.timers.clear();
  fs.saving = true; emit('saving');
  const secs = [...fs.pending]; const patch = {};
  for (const s of secs) { if (s === '__name') patch.name = fs.plan.name; else patch[s] = fs.plan[s]; }
  try {
    const saved = await backend().update('fire_plans', { id: fs.row.id }, patch);
    fs.row = saved; for (const s of secs) fs.pending.delete(s); fs.lastSaved = new Date(); fs.online = true;
  } catch (e) { if (e.offline) fs.online = false; else { fs.error = e.message; for (const s of secs) fs.pending.delete(s); } }
  finally { fs.saving = false; persistCache(); emit('saved'); }
  if (fs.pending.size && fs.online) flush().catch(() => {});
}
export async function saveMc(result) {
  fs.mc = result; persistCache(); emit('mc');
  try { if (fs.row?.id) await backend().update('fire_plans', { id: fs.row.id }, { mc_last: result }); } catch {}
}

/** Replace the whole plan (import / restore a snapshot). */
export async function replacePlan(plan) {
  const p = normalizePlan(plan); fs.plan = p; for (const s of SECTIONS) fs.pending.add(s); fs.pending.add('__name'); fs.history = []; persistCache(); emit('edit'); await flush();
}

// ---- snapshots ----
export async function takeSnapshot(name, note = '', summary = {}) {
  const saved = await backend().insert('fire_snapshots', { space_id: spaceId(), plan_id: fs.row?.id || null, name, note, plan: clone({ name: fs.plan.name, ...Object.fromEntries(SECTIONS.map((s) => [s, fs.plan[s]])) }), summary });
  fs.snapshots = [saved, ...fs.snapshots]; emit('snapshots'); return saved;
}
export async function deleteSnapshot(id) { await backend().remove('fire_snapshots', { id }); fs.snapshots = fs.snapshots.filter((s) => s.id !== id); emit('snapshots'); }
export async function restoreSnapshot(id) { const s = fs.snapshots.find((x) => x.id === id); if (!s) throw new Error('Snapshot not found'); await replacePlan(s.plan); }

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { if (fs.pending.size) flush().catch(() => {}); });
  setInterval(() => { if (fs.pending.size && fs.online !== false) flush().catch(() => {}); }, 30000).unref?.();
}
export const unsent = () => fs.pending.size;
