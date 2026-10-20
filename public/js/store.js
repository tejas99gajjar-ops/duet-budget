// In-memory cache of the shared account + IndexedDB persistence + an offline queue for transactions.
import * as Dt from './dates.js';
import { TABLES } from './backend.js';

const listeners = new Map();
export const on = (evt, cb) => { (listeners.get(evt) || listeners.set(evt, new Set()).get(evt)).add(cb); return () => listeners.get(evt).delete(cb); };
const emit = (evt, arg) => { for (const cb of listeners.get(evt) || []) try { cb(arg); } catch (e) { console.error(e); } };

// ---- tiny IndexedDB key/value helper (falls back to memory if IndexedDB is unavailable) ----
const mem = new Map();
const idb = () => new Promise((res, rej) => { if (typeof indexedDB === 'undefined') return rej(new Error('no idb')); const r = indexedDB.open('duet', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const kv = {
  async get(k) { try { const db = await idb(); return await new Promise((res, rej) => { const r = db.transaction('kv').objectStore('kv').get(k); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); } catch { return mem.get(k); } },
  async set(k, v) { mem.set(k, v); try { const db = await idb(); await new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); } catch {} },
  async del(k) { mem.delete(k); try { const db = await idb(); await new Promise((res) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').delete(k); t.oncomplete = res; }); } catch {} },
};

export const state = { backend: null, user: null, data: null, queue: [], online: true, live: false, flushing: false, lastError: null };
const emptyData = () => ({ space: null, members: [], wallets: [], categories: [], transactions: [], budgets: [], recurring: [], investments: [], activity: [] });
let unsub = null, refreshTimer = null, tempSeq = 0;

export function configure(backend) { state.backend = backend; }
const persist = () => kv.set('cache', { userId: state.user?.id, data: state.data, queue: state.queue });

function normalise(table, rows) {
  if (table === 'transactions') return rows.map((t) => ({ ...t, time: String(t.time || '12:00').slice(0, 5), tags: t.tags || [] }));
  if (table === 'members') return rows.map((m) => ({ id: m.user_id, name: m.name, email: m.email, color: m.color, space_id: m.space_id }));
  return rows;
}

/** Re-applies queued (not yet synced) transaction changes on top of fresh server rows. */
function applyQueue(data, queue) {
  for (const q of queue) {
    if (q.op === 'insert') data.transactions.push({ ...q.row, id: q.tempId, pending_sync: true });
    else if (q.op === 'update') { const t = data.transactions.find((x) => x.id === q.id); if (t) Object.assign(t, q.patch, { pending_sync: true }); }
    else if (q.op === 'delete') data.transactions = data.transactions.filter((x) => x.id !== q.id);
  }
}

export async function refresh(tables = TABLES) {
  if (!state.user) return;
  const fresh = state.data || emptyData();
  const results = await Promise.all(tables.map(async (t) => [t, normalise(t, await state.backend.fetchAll(t))]));
  const data = { ...fresh };
  for (const [t, rows] of results) { if (t === 'spaces') data.space = rows[0] || null; else data[t] = rows; }
  if (tables.includes('transactions')) applyQueue(data, state.queue);
  state.data = data; await persist(); emit('change', tables);
}

export async function init() {
  state.user = await state.backend.auth.getSession();
  state.online = navigator.onLine !== false;
  if (!state.user) { state.data = null; return null; }
  const cached = await kv.get('cache');
  if (cached && cached.userId === state.user.id) { state.data = cached.data || emptyData(); state.queue = cached.queue || []; }
  try { await refresh(); await afterOnline(); } catch (e) { if (!e.offline || !state.data?.space) throw e; state.online = false; }
  return state.user;
}

async function afterOnline() {
  await flush();
  try { const n = await state.backend.rpc('run_recurring'); if (n > 0) await refresh(['transactions', 'recurring', 'activity']); } catch (e) { if (!e.offline) console.warn('run_recurring', e.message); }
  connectRealtime();
}

const dirty = new Set();
function connectRealtime() {
  if (unsub || !state.data?.space) return;
  unsub = state.backend.subscribe(state.data.space.id, (table) => {
    dirty.add(table); if (table === 'members') dirty.add('spaces');
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => { const t = [...dirty]; dirty.clear(); refresh(t).catch(() => {}); }, 200);
  }, (status) => { state.live = status === 'SUBSCRIBED'; emit('sync'); });
}
export function disconnect() { unsub?.(); unsub = null; clearTimeout(refreshTimer); state.live = false; }

// ---- mutations ----
const isNetwork = (e) => e?.offline || navigator.onLine === false;
const temp = () => -(++tempSeq + Date.now() % 100000);

export async function insert(table, row) {
  try { const saved = await state.backend.insert(table, row); const [n] = normalise(table, [saved]); state.data[table] = [...state.data[table], n]; await persist(); emit('change', [table]); return n; }
  catch (e) {
    if (table !== 'transactions' || !isNetwork(e)) throw e;
    const tempId = temp(), q = { op: 'insert', table, row, tempId }; state.queue.push(q); const n = { ...row, id: tempId, pending_sync: true };
    state.data.transactions.push(n); state.online = false; await persist(); emit('change', [table]); emit('sync'); return n;
  }
}
export async function update(table, id, patch, match = { id }) {
  const queued = state.queue.find((q) => q.op === 'insert' && q.tempId === id);
  if (queued) { Object.assign(queued.row, patch); Object.assign(state.data.transactions.find((t) => t.id === id) || {}, patch); await persist(); emit('change', [table]); return; }
  try {
    const saved = await state.backend.update(table, match, patch); const [n] = normalise(table, [saved]);
    if (table === 'spaces') state.data.space = { ...state.data.space, ...saved };
    else state.data[table] = state.data[table].map((r) => (r.id === n.id ? { ...r, ...n } : r));
    await persist(); emit('change', [table]);
  } catch (e) {
    if (table !== 'transactions' || !isNetwork(e)) throw e;
    state.queue.push({ op: 'update', table, id, patch }); Object.assign(state.data.transactions.find((t) => t.id === id) || {}, patch, { pending_sync: true }); state.online = false; await persist(); emit('change', [table]); emit('sync');
  }
}
export async function remove(table, id, match = { id }) {
  const qi = state.queue.findIndex((q) => q.op === 'insert' && q.tempId === id);
  if (qi >= 0) { state.queue.splice(qi, 1); state.queue = state.queue.filter((q) => q.id !== id); state.data.transactions = state.data.transactions.filter((t) => t.id !== id); await persist(); emit('change', [table]); emit('sync'); return; }
  try { await state.backend.remove(table, match); state.data[table] = state.data[table].filter((r) => r.id !== id); await persist(); emit('change', [table]); }
  catch (e) {
    if (table !== 'transactions' || !isNetwork(e)) throw e;
    state.queue.push({ op: 'delete', table, id }); state.data.transactions = state.data.transactions.filter((t) => t.id !== id); state.online = false; await persist(); emit('change', [table]); emit('sync');
  }
}
export async function rpc(name, args) { const r = await state.backend.rpc(name, args); await refresh().catch(() => {}); return r; }

/** Sends queued offline changes, oldest first. Network failure keeps the rest queued; a rejected change is dropped and reported. */
export async function flush() {
  if (state.flushing || !state.queue.length || !state.user) return;
  state.flushing = true; const idMap = new Map();
  try {
    while (state.queue.length) {
      const q = state.queue[0], real = (id) => idMap.get(id) ?? id;
      try {
        if (q.op === 'insert') { const saved = await state.backend.insert(q.table, q.row); idMap.set(q.tempId, saved.id); }
        else if (q.op === 'update') await state.backend.update(q.table, { id: real(q.id) }, q.patch);
        else await state.backend.remove(q.table, { id: real(q.id) });
      } catch (e) {
        if (isNetwork(e)) { state.online = false; break; }
        state.lastError = e.message; emit('sync-error', e.message);
      }
      state.queue.shift();
    }
  } finally { state.flushing = false; }
  state.online = state.queue.length === 0 || state.online;
  await persist();
  if (!state.queue.length) { await refresh(['transactions', 'wallets', 'activity']).catch(() => {}); state.online = true; }
  emit('sync');
}

export async function signedOut() { disconnect(); state.user = null; state.data = null; state.queue = []; await kv.del('cache'); }
export const pending = () => state.queue.length;
export const today = () => Dt.todayIn(state.data?.space?.tz || 'UTC');

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { state.online = true; emit('sync'); if (state.user) flush().then(() => refresh()).then(() => connectRealtime()).catch(() => {}); });
  window.addEventListener('offline', () => { state.online = false; emit('sync'); });
  setInterval(() => { if (state.queue.length && state.user && navigator.onLine !== false) flush().catch(() => {}); }, 30000).unref?.();
}

/** After the user joins a different account: drop the old subscription and load the new space. */
export async function rejoin() { disconnect(); state.data = null; await refresh(); connectRealtime(); }
export const connect = () => connectRealtime();
