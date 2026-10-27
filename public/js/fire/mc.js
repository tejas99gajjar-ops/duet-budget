// Monte Carlo (method 2): random market returns, inflation, medical shocks; probability the money lasts to the horizon age.
// Plain seeded random sampling. No machine learning, no AI, no network.
import { buildModel, targetFromModel, projectFromModel } from './engine.js';
import { CLASSES, CLASS_INFO } from './defaults.js';

export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function normalGen(rand) {
  let spare = null;
  return () => { if (spare !== null) { const s = spare; spare = null; return s; } let u = 0, v = 0; while (u === 0) u = rand(); v = rand(); const r = Math.sqrt(-2 * Math.log(u)); spare = r * Math.sin(2 * Math.PI * v); return r * Math.cos(2 * Math.PI * v); };
}
const pct = (sorted, p) => { if (!sorted.length) return 0; const i = (sorted.length - 1) * p; const lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); };

/** Everything that does not change between paths. */
function prepare(m, mc) {
  const nPre = Math.max(0, m.retireYear - m.baseYear), n = m.nYears;
  const idx = Object.fromEntries(CLASSES.map((c, i) => [c, i]));
  const B0 = new Float64Array(CLASSES.length), contrib = CLASSES.map(() => new Float64Array(n)), wMean = new Float64Array(CLASSES.length), wSum = new Float64Array(CLASSES.length);
  const retId = m.retGoal.id;
  for (const h of m.holdings) {
    const share = h.split[retId] || 0; if (!share) continue;
    const tot = h.v0 + h.contribReal.reduce((s, x) => s + x, 0) || 1;
    for (const c of h.comps) {
      const k = idx[c.cls]; B0[k] += h.v0 * share * c.w;
      for (let i = 0; i < n; i++) contrib[k][i] += h.contribReal[i] * share * c.w;
      wMean[k] += h.nomRet * tot * c.w; wSum[k] += tot * c.w;
    }
  }
  const mean = CLASSES.map((c, k) => (wSum[k] ? wMean[k] / wSum[k] : m.A.returns[c]) / 100);
  const vol = CLASSES.map((c) => (m.A.vol[c] ?? CLASS_INFO[c].vol) / 100);
  if (mc.equityVol != null && mc.equityVol !== '') vol[idx.equity] = Number(mc.equityVol) / 100;
  const beta = CLASSES.map((c) => CLASS_INFO[c].beta);
  const net = new Float64Array(n);
  if (m.cashflowModeled) for (let i = 0; i < nPre; i++) net[i] = m.incomeReal[i] - m.spendReal[i] - m.loanReal[i] - m.premReal[i] - m.evReal[i] - m.takeContrib[i];
  const target = targetFromModel(m);
  return { nPre, n, idx, B0, contrib, mean, vol, beta, net, target, allocIdx: Object.entries(m.allocW).filter(([, w]) => w > 0).map(([c, w]) => [idx[c], w]) };
}

/**
 * Runs `paths` random lives. Returns success probability, corpus percentiles at retirement and a fan of percentiles by year.
 * mc = { paths, seed, equityVol, includeEvents, sequenceRisk }
 */
export function runMonteCarlo(m, mcIn = {}, onProgress) {
  const mc = { paths: 10000, seed: 1, includeEvents: true, sequenceRisk: true, equityVol: null, rule: 'fixed', flexCut: 10, flexTrigger: -5, crash: null, ...mcIn };
  const t0 = Date.now(), P = prepare(m, mc), rand = rng(mc.seed), z = normalGen(rand);
  const { nPre, n } = P, K = CLASSES.length, rows = P.target.rows, nPost = rows.length;
  const inflSd = (m.A.inflationVol ?? 1.5) / 100, relSd = 0.01, infl = m.infl;
  const keep = Math.min(mc.paths, 4000), fanYears = n + 1;
  const fan = new Float32Array(keep * fanYears);
  const atRet = new Float64Array(mc.paths); const failAges = new Map(); let ok = 0;
  const B = new Float64Array(K), zc = new Float64Array(K), rr = new Float64Array(K);
  const retWeights = P.allocIdx, shockP = mc.includeEvents ? 0.03 : 0, shockMedian = 300000;
  const portSeries = new Float64Array(Math.max(1, nPost));
  const sqrtOneMinusB2 = P.beta.map((b) => Math.sqrt(Math.max(0, 1 - b * b)));
  const draw = (zm, piShock) => { for (let k = 0; k < K; k++) { zc[k] = z(); const r = P.mean[k] + P.vol[k] * (P.beta[k] * zm + sqrtOneMinusB2[k] * zc[k]); rr[k] = (1 + Math.max(r, -0.6)) / (1 + infl + piShock) - 1; } };
  for (let p = 0; p < mc.paths; p++) {
    for (let k = 0; k < K; k++) B[k] = P.B0[k];
    const store = p < keep; const base = p * fanYears; if (store) fan[base] = B.reduce((s, x) => s + x, 0);
    let failed = false, failAge = null;
    for (let i = 0; i < nPre; i++) {
      const y = m.baseYear + i, fy = m.frac(y);
      draw(z(), z() * inflSd);
      let tot = 0;
      for (let k = 0; k < K; k++) { B[k] = B[k] * Math.pow(1 + rr[k], fy) + P.contrib[k][i] * Math.pow(1 + rr[k], fy / 2); tot += B[k]; }
      let flow = P.net[i];
      if (shockP && rand() < shockP) flow -= Math.exp(Math.log(shockMedian) + 0.7 * z()) * m.rGroup('medical', y);
      if (flow < 0) { const take = Math.min(tot, -flow); if (tot > 0) for (let k = 0; k < K; k++) B[k] -= (B[k] / tot) * take; if (-flow > tot) { failed = true; failAge = y - m.birth; } }
      else if (flow > 0 && m.A.investSurplus) B[P.idx.debt] += flow;
      if (store) { let s = 0; for (let k = 0; k < K; k++) s += B[k]; fan[base + i + 1] = s; }
    }
    let C = 0; for (let k = 0; k < K; k++) C += B[k];
    if (m.retireYear <= m.baseYear) { C = 0; for (let k = 0; k < K; k++) C += P.B0[k]; }
    atRet[p] = C;
    // retirement: pooled corpus held in the retirement allocation
    if (nPost) {
      for (let j = 0; j < nPost; j++) { draw(z(), z() * inflSd); let r = 0; for (const [k, w] of retWeights) r += w * rr[k]; portSeries[j] = r; }
      if (!mc.sequenceRisk) { let lg = 0; for (let j = 0; j < nPost; j++) lg += Math.log(1 + portSeries[j]); const g = Math.exp(lg / nPost) - 1; for (let j = 0; j < nPost; j++) portSeries[j] = g; }
      if (mc.crash) for (let j = 0; j < Math.min(nPost, mc.crash.years || 2); j++) portSeries[j] = -Math.abs(mc.crash.size) / 100;   // stress test: forced losses in the first retirement years
      let medX = 1, eduX = 1, houX = 1;
      for (let j = 0; j < nPost; j++) {
        const row = rows[j], y = row.year; medX *= 1 + relSd * z(); eduX *= 1 + relSd * z(); houX *= 1 + relSd * z();
        let spend = row.byGroup.general + row.byGroup.medical * medX + row.byGroup.education * eduX + row.byGroup.housing * houX + row.premiums + row.events - row.passive;
        if (shockP && rand() < shockP) spend += Math.exp(Math.log(shockMedian) + 0.7 * z()) * m.rGroup('medical', y);
        let w = Math.max(0, spend) * m.grossUp;
        if (mc.rule === 'flexible' && j > 0 && portSeries[j - 1] < mc.flexTrigger / 100) w *= 1 - mc.flexCut / 100;   // tighten spending after a bad year
        if (!failed) { C = (C - w) * (1 + portSeries[j]); if (C < 0) { failed = true; failAge = row.age; C = 0; } }
        if (store) { const col = y - m.baseYear + 1; if (col <= n) fan[base + col] = failed ? 0 : C; }
      }
    }
    if (store && nPost) { /* years before retirement but after the last stored column are already written */ }
    if (!failed) ok++; else failAges.set(failAge, (failAges.get(failAge) || 0) + 1);
    if (onProgress && (p + 1) % 500 === 0) onProgress(p + 1, mc.paths);
  }
  const sorted = Float64Array.from(atRet).sort();
  const colsP = (q) => { const out = new Array(fanYears); const tmp = new Float32Array(keep); for (let c = 0; c < fanYears; c++) { for (let p = 0; p < keep; p++) tmp[p] = fan[p * fanYears + c]; out[c] = pct(Float32Array.from(tmp).sort(), q); } return out; };
  const hist = [...failAges.entries()].sort((a, b) => a[0] - b[0]).map(([age, count]) => ({ age, count }));
  let medFail = null; if (hist.length) { let acc = 0; const tot = hist.reduce((s, h) => s + h.count, 0); for (const h of hist) { acc += h.count; if (acc >= tot / 2) { medFail = h.age; break; } } }
  const years = Array.from({ length: fanYears }, (_, i) => m.baseYear + i);
  return { paths: mc.paths, seed: mc.seed, success: ok / mc.paths, successes: ok, retireAge: m.retireAge, retireYear: m.retireYear, horizonAge: m.horizonAge,
    corpusAtRetirement: { p10: pct(sorted, 0.1), p25: pct(sorted, 0.25), p50: pct(sorted, 0.5), p75: pct(sorted, 0.75), p90: pct(sorted, 0.9) }, target: P.target.total,
    fan: { years, ages: years.map((y) => y - m.birth), p10: colsP(0.1), p25: colsP(0.25), p50: colsP(0.5), p75: colsP(0.75), p90: colsP(0.9) }, failHistogram: hist, medianFailAge: medFail,
    settings: { sequenceRisk: mc.sequenceRisk, includeEvents: mc.includeEvents, equityVol: P.vol[P.idx.equity] * 100, rule: mc.rule, crash: mc.crash }, ms: Date.now() - t0 };
}

/** Success probability for each retirement age (smaller runs so it stays quick). */
export function successByAge(plan, opts = {}, mc = {}, from = 45, to = 60, onProgress) {
  const out = [];
  for (let a = from; a <= to; a++) {
    const m = buildModel(plan, { ...opts, retireAge: a });
    out.push({ age: a, success: runMonteCarlo(m, { ...mc, paths: mc.pathsPerAge || 1500 }).success });
    onProgress?.(a - from + 1, to - from + 1);
  }
  return out;
}

/** Years of extra work needed to bring a given corpus up to the target (used for the "Delay N yrs" label). */
export function delayYearsFor(plan, opts, scale) {
  const base = buildModel(plan, opts); let a = base.retireAge;
  for (let k = 0; k <= 20; k++) { const m = buildModel(plan, { ...opts, retireAge: a + k }); const t = targetFromModel(m).total; const proj = projectFromModel(m).corpusAtRetire; if (proj * scale >= t) return k; }
  return null;
}
