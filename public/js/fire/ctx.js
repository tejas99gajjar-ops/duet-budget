// Shared state for the planner screens: the plan, memoised results, money basis, and the background Monte Carlo runner.
import * as FS from './store.js';
import { runPlan, ageGrid, closeGap, earliestAge, buildModel } from './engine.js';
import { runMonteCarlo } from './mc.js';
import { state as core } from '../core.js';

let redrawFn = () => {};
export const setRedraw = (fn) => { redrawFn = fn; };
/** Re-render the current planner screen (on a fresh element, so click handlers never stack up). */
export const redraw = () => redrawFn();
export const today = () => core.boot?.today || new Date().toISOString().slice(0, 10);
export const getPlan = () => FS.fs.plan;
export const hashOf = (obj) => { const s = JSON.stringify(obj); let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return String(h >>> 0); };

const cache = new Map();
const memo = (fn) => (...args) => { const key = JSON.stringify(args); if (cache.has(key)) return cache.get(key); const v = fn(...args); cache.set(key, v); if (cache.size > 80) cache.delete(cache.keys().next().value); return v; };
export const run = (opts = {}, p = getPlan()) => memo((pj, o, t) => runPlan(JSON.parse(pj), { today: t, ...o }))(JSON.stringify(p), opts, today());
export const grid = (opts = {}, from, to, p = getPlan()) => memo((pj, o, t, a, b) => ageGrid(JSON.parse(pj), { today: t, ...o }, a, b))(JSON.stringify(p), opts, today(), from, to);
export const close = (opts = {}, p = getPlan()) => memo((pj, o, t) => closeGap(JSON.parse(pj), { today: t, ...o }))(JSON.stringify(p), opts, today());
export { earliestAge };

/** The plan fields that change a result (settings like the theme or the last MC run do not). */
export const planHash = (p = getPlan()) => hashOf({ ...p, name: undefined, settings: { activeScenarioId: p.settings.activeScenarioId, retireAge: p.settings.retireAge, mc: p.settings.mc } });

export const basis = () => getPlan().settings.basis || 'today';
export const conv = (v, res) => (basis() === 'nominal' && res ? v * res.meta.nominalFactor : v);
export const basisLabel = () => (basis() === 'nominal' ? 'Nominal ₹' : "Today's ₹");
export const mcSettings = (p = getPlan()) => ({ paths: 10000, seed: 20261026, fixedSeed: true, includeEvents: true, sequenceRisk: true, equityVol: null, ...(p.settings.mc || {}) });

// ---- Monte Carlo in a worker (falls back to the main thread) ----
let worker = null, seq = 0; const pending = new Map();
function getWorker() {
  if (worker !== null) return worker;
  try { worker = new Worker(new URL('./mc-worker.js', import.meta.url), { type: 'module' }); worker.onmessage = (e) => { const p = pending.get(e.data.id); if (!p) return; if (e.data.type === 'progress') p.onProgress?.(e.data.done, e.data.total); else { pending.delete(e.data.id); e.data.type === 'done' ? p.resolve(e.data.result) : p.reject(new Error(e.data.message)); } }; worker.onerror = () => { worker = false; for (const p of pending.values()) p.reject(new Error('worker failed')); pending.clear(); }; }
  catch { worker = false; }
  return worker;
}
export function runMc(opts = {}, mcOverride = {}, onProgress) {
  const p = getPlan(), mc = { ...mcSettings(p), ...mcOverride }; if (!mc.fixedSeed) mc.seed = Math.floor(Math.random() * 1e9);
  const w = getWorker(); const o = { today: today(), ...opts };
  if (w) return new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject, onProgress }); w.postMessage({ id, kind: 'run', plan: p, opts: o, mc }); }).catch(() => runMain(p, o, mc, onProgress));
  return runMain(p, o, mc, onProgress);
}
async function runMain(p, o, mc, onProgress) { await new Promise((r) => setTimeout(r, 0)); return runMonteCarlo(buildModel(p, o), mc, onProgress); }
export function runMcByAge(opts = {}, from = 45, to = 60, onProgress) {
  const p = getPlan(), mc = { ...mcSettings(p), includeEvents: false, pathsPerAge: 1200 }, w = getWorker(), o = { today: today(), ...opts };
  if (w) return new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject, onProgress }); w.postMessage({ id, kind: 'byAge', plan: p, opts: o, mc, from, to }); }).catch(async () => (await import('./mc.js')).successByAge(p, o, mc, from, to, onProgress));
  return import('./mc.js').then((m) => m.successByAge(p, o, mc, from, to, onProgress));
}

/** The stored Monte Carlo result if it still matches the current plan, else null. */
export const mcFresh = () => (FS.fs.mc && FS.fs.mc.planHash === planHash() ? FS.fs.mc : null);
let mcRunning = null;
/** Runs Monte Carlo when there is no up-to-date result; stores it and tells the screens. */
export function ensureMc({ force = false, onProgress } = {}) {
  if (!force && mcFresh()) return Promise.resolve(mcFresh());
  if (mcRunning && !force) return mcRunning;
  const h = planHash(); const t0 = run().meta.retireAge;
  mcRunning = runMc({}, {}, onProgress).then(async (r) => { r.planHash = h; r.ranAt = new Date().toISOString(); r.retireAge = t0; await FS.saveMc(r); FS.edit('settings', (st) => { st.mcHistory = [{ t: r.ranAt, success: r.success, paths: r.paths, seed: r.seed, retireAge: r.retireAge, equityVol: r.settings.equityVol, seq: r.settings.sequenceRisk, events: r.settings.includeEvents, rule: r.settings.rule, p10: r.corpusAtRetirement.p10, p50: r.corpusAtRetirement.p50, p90: r.corpusAtRetirement.p90 }, ...(st.mcHistory || [])].slice(0, 5); return st; }, { noUndo: true }); return r; }).finally(() => { mcRunning = null; });
  return mcRunning;
}
export const isMcRunning = () => !!mcRunning;
