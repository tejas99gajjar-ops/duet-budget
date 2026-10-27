// Detail tab: Monte Carlo (method 2).
import { h, raw, IC, chip, tile, note, head, openForm, openInfo, toast, sheet } from './ui.js';
import * as FS from './store.js';
import * as X from './ctx.js';
import { inr, inrC, pc, ago } from './format.js';
import { ring, fanChart, ageStrip } from './charts.js';
import { delayYearsFor } from './mc.js';

const ui = { crashSize: 30, crashYears: 2, crash: null, crashFor: null, byAge: null, byAgeFor: null, compare: [], progress: null };

export function mcTab(plan, res) {
  const C = (v) => X.conv(v, res), m = res.meta, g = res.gap, S = X.mcSettings(plan);
  const fresh = X.mcFresh(), mc = fresh || FS.fs.mc, stale = !!mc && !fresh, running = X.isMcRunning();
  const hash = X.planHash();
  if (!fresh && !running) X.ensureMc({ onProgress: (d, t) => { ui.progress = d / t; const el = document.getElementById('mcprog'); if (el) el.style.width = `${ui.progress * 100}%`; } }).catch(() => {});
  if (ui.byAgeFor !== hash && !ui.byAgeRunning) { ui.byAgeRunning = true; X.runMcByAge({}, Math.max(45, m.ageNow + 1), 60).then((r) => { ui.byAge = r; ui.byAgeFor = hash; ui.byAgeRunning = false; X.redraw(); }).catch(() => { ui.byAgeRunning = false; }); }
  if (ui.crashFor !== hash + ui.crashSize + ui.crashYears && !ui.crashRunning && fresh) { ui.crashRunning = true; const key = hash + ui.crashSize + ui.crashYears; X.runMc({}, { paths: 3000, crash: { size: ui.crashSize, years: ui.crashYears } }).then((r) => { ui.crash = r; ui.crashFor = key; ui.crashRunning = false; X.redraw(); }).catch(() => { ui.crashRunning = false; }); }
  const thr = (plan.assumptions.successThreshold ?? 80) / 100, s = mc?.success, tone = s == null ? 'warn' : s >= thr ? 'ok' : s >= 0.6 ? 'warn' : 'bad';
  const label = s == null ? 'Calculating…' : s >= thr ? `On track: above the ${Math.round(thr * 100)}% benchmark` : s >= 0.6 ? `Borderline: aim for ${Math.round(thr * 100)}%+` : 'At risk: below 60%';
  const col = { ok: 'var(--fx-ok)', warn: 'var(--fx-warn)', bad: 'var(--fx-bad)' }[tone];
  const target = g.target, cr = mc?.corpusAtRetirement;
  const resultFor = (v) => { if (v >= target * 1.15) return ['Retire early', 'ok']; if (v >= target) return ['On track', 'ok']; const miss = target - v; if (miss > target * 0.3) { const d = delayYearsFor(plan, { today: X.today() }, v / Math.max(1, g.projected)); return [d != null ? `Delay ${d} yrs` : 'Far short', 'bad']; } return [`${inrC(C(miss))} short`, 'warn']; };
  const rows = cr ? [['Best (90th pct)', cr.p90, 'ok'], ['75th pct', cr.p75, 'warn'], ['Median (50th)', cr.p50, ''], ['Worst (10th pct)', cr.p10, 'bad']] : [];
  const hist = mc?.failHistogram || [], hmax = Math.max(...hist.map((x) => x.count), 1);
  const history = plan.settings.mcHistory || [];
  const body = h`
    <div class="fx-card"><div class="fx-row" style="gap:18px;align-items:center"><div style="flex-shrink:0">${ring(s ?? 0, { size: 128, color: col, label: 'success', big: s != null ? `${Math.round(s * 100)}%` : '…' })}</div>
      <div class="grow"><div class="fx-sub">${mc ? `${mc.paths.toLocaleString('en-IN')} simulations run` : 'Running simulations…'}</div><div class="fx-mid" style="color:${col};margin:4px 0;white-space:normal">${s != null ? `${Math.round(s * 100)}% chance` : '…'}</div>
        <div class="fx-sub" style="color:var(--text)">your money lasts until age ${m.horizonAge} at this retirement age (${m.retireAge}).</div><div style="margin-top:8px"><span class="fx-chip ${tone}" style="white-space:normal">● ${label}</span></div></div></div>
      ${running ? h`<div class="fx-bar" style="margin-top:12px"><i id="mcprog" style="width:${(ui.progress || 0) * 100}%"></i></div>` : ''}
      ${stale ? h`<div class="fx-note warn" style="margin-top:12px"><span>⟳</span><div>Your inputs changed since this run. A fresh run is in progress.</div></div>` : ''}
      <div class="fx-row fx-between fx-sub" style="margin-top:12px"><span>${mc ? `Run ${ago(mc.ranAt)} · seed ${mc.seed}` : ''}</span><span class="fx-row" style="gap:12px"><button class="fx-link" data-act="calc">How it works</button><button class="fx-link" data-act="rerun">Run again</button></span></div></div>
    <div class="fx-card"><div class="fx-ch"><h3>Simulation settings</h3><button class="iconbtn" data-act="mcset" aria-label="More settings">${IC.edit}</button></div>
      <div class="col" style="gap:14px"><div class="fx-row fx-between"><span style="font-size:16px;color:var(--muted)">Simulations</span><div class="fx-chips">${[1000, 10000, 100000].map((n) => h`<button class="fx-opt ${S.paths === n ? 'on' : ''}" data-act="paths" data-n="${n}">${n >= 1000 ? `${n / 1000}K` : n}</button>`)}</div></div>
        <button class="fx-row fx-between" data-act="vol" style="text-align:left"><span style="font-size:16px;color:var(--muted)">Equity volatility (std dev)</span><b>±${Math.round(S.equityVol ?? plan.assumptions.vol.equity)}%</b></button>
        <div class="fx-row fx-between"><span style="font-size:16px;color:var(--muted)">Include life events</span><button class="fx-toggle ${S.includeEvents ? 'on' : ''}" role="switch" aria-checked="${!!S.includeEvents}" data-act="mctog" data-k="includeEvents"></button></div>
        <div class="fx-row fx-between"><span style="font-size:16px;color:var(--muted)">Sequence-of-returns risk</span><button class="fx-toggle ${S.sequenceRisk ? 'on' : ''}" role="switch" aria-checked="${!!S.sequenceRisk}" data-act="mctog" data-k="sequenceRisk"></button></div>
        <div class="fx-row fx-between"><span style="font-size:16px;color:var(--muted)">Withdrawals</span><div class="fx-seg sm">${[['fixed', 'Fixed'], ['flexible', 'Flexible']].map(([k, l]) => h`<button class="${(S.rule || 'fixed') === k ? 'on' : ''}" data-act="rule" data-k="${k}">${l}</button>`)}</div></div></div>
      <div class="fx-help" style="margin-top:10px">${S.rule === 'flexible' ? `Flexible: spending is cut ${S.flexCut ?? 10}% after a year when the portfolio falls more than ${Math.abs(S.flexTrigger ?? -5)}%.` : 'Fixed: you spend the same real amount every year, whatever the market does.'}</div></div>
    <div class="fx-card"><h3 style="margin-bottom:10px">Corpus range at each age (${X.basis() === 'nominal' ? 'nominal' : "today's"} ₹)</h3>${mc ? fanChart(mc.fan, { target: C(target), retireAge: m.retireAge, fromAge: m.ageNow, toAge: Math.min(m.horizonAge, 75) }) : h`<div class="fx-skel" style="height:190px"></div>`}
      <div class="fx-legend" style="margin-top:8px"><span><i style="background:var(--fx);opacity:.35"></i>10–90th pct</span><span><i style="background:var(--fx);opacity:.6"></i>25–75th pct</span><span><i style="background:var(--fx-warn)"></i>Median</span><span><i style="background:var(--fx-bad)"></i>Target</span></div></div>
    <div class="fx-card"><h3>Corpus at retirement · age ${m.retireAge}</h3><table class="fx-table" style="margin-top:8px"><thead><tr><th>Scenario</th><th>Corpus</th><th>Result</th></tr></thead><tbody>${rows.map(([l, v, t]) => { const [txt, tn] = resultFor(v); return h`<tr><td class="${t}" style="font-weight:700">${l}</td><td><b>${inrC(C(v))}</b></td><td><span class="fx-chip ${tn}">${txt}</span></td></tr>`; })}</tbody></table>
      <div class="fx-sub" style="margin-top:8px">Target ${inrC(C(target))}. The deterministic projection (${inrC(C(g.projected))}) assumes the same return every year; random years make the median a little lower.</div></div>
    <div class="fx-card"><div class="fx-ch"><h3>Success by retirement age</h3></div>${ui.byAge && ui.byAgeFor === hash ? ageStrip(ui.byAge, { selected: m.retireAge, mode: 'success' }) : h`<div class="fx-skel" style="height:96px"></div>`}<div class="fx-sub" style="margin-top:6px">Green = 80% or better. Tap a bar to set your retirement age.</div></div>
    <div class="fx-card"><h3>Worst-year view</h3><div class="fx-sub" style="margin:4px 0 12px">What if markets fall right after you retire?</div><div class="fx-row" style="gap:10px;flex-wrap:wrap"><div class="fx-seg sm">${[20, 30, 40].map((n) => h`<button class="${ui.crashSize === n ? 'on' : ''}" data-act="crash" data-n="${n}">−${n}%</button>`)}</div><div class="fx-seg sm">${[1, 2].map((n) => h`<button class="${ui.crashYears === n ? 'on' : ''}" data-act="crashy" data-n="${n}">${n} yr${n > 1 ? 's' : ''}</button>`)}</div></div>
      <div style="margin-top:12px">${ui.crash && ui.crashFor === hash + ui.crashSize + ui.crashYears && s != null ? h`<div class="fx-sub" style="color:var(--text);font-size:15px">If markets fall <b>${ui.crashSize}%</b> a year for the first <b>${ui.crashYears}</b> ${ui.crashYears > 1 ? 'years' : 'year'} of retirement, success drops from <b>${Math.round(s * 100)}%</b> to <b class="bad">${Math.round(ui.crash.success * 100)}%</b>.</div>` : h`<div class="fx-sub">Calculating…</div>`}</div></div>
    ${hist.length ? h`<div class="fx-card"><h3>When money runs out (failed runs)</h3><div class="fx-sub" style="margin:4px 0 10px">Median failure at age ${mc.medianFailAge}</div><div class="fx-row" style="align-items:flex-end;height:80px;gap:3px">${hist.map((x) => h`<div class="grow" title="Age ${x.age}: ${x.count}" style="background:var(--fx-bad);opacity:.75;border-radius:3px 3px 0 0;height:${Math.max(4, (x.count / hmax) * 74)}px"></div>`)}</div><div class="fx-row fx-between fx-sub"><span>${hist[0].age}</span><span>${hist[hist.length - 1].age}</span></div></div>` : ''}
    <div class="fx-card"><div class="fx-ch"><h3>Run history</h3>${ui.compare.length === 2 ? h`<button class="fx-link" data-act="compare">Compare →</button>` : h`<span class="fx-sub">pick two to compare</span>`}</div>${history.length ? h`<div class="fx-list">${history.map((r, i) => h`<button class="fx-li" data-act="hpick" data-i="${i}"><span class="fx-opt ${ui.compare.includes(i) ? 'on' : ''}" style="padding:4px 10px">${ui.compare.includes(i) ? '✓' : i + 1}</span><span class="grow"><b>${Math.round(r.success * 100)}% success</b><div class="fx-sub">${ago(r.t)} · ${r.paths.toLocaleString('en-IN')} runs · age ${r.retireAge} · seed ${r.seed}</div></span></button>`)}</div>` : h`<div class="fx-sub">Runs appear here.</div>`}</div>
    <div class="fx-note purple"><span>ℹ️</span><div>Monte Carlo results are estimates. They depend on your assumptions, and past Indian market returns do not guarantee future ones. Fixed items such as EMIs and premiums are not randomised.</div></div>`;
  const setMc = (patch) => FS.edit('settings', (st) => { st.mc = { ...(st.mc || {}), ...patch }; return st; }, { immediate: true, noUndo: true });
  return { body, after: { clicks: {
    calc: () => { location.hash = '#/fire/detail/calc'; }, rerun: () => { toast('Running…'); X.ensureMc({ force: true }).then(() => X.redraw()); },
    paths: (el) => setMc({ paths: Number(el.dataset.n) }), mctog: (el) => setMc({ [el.dataset.k]: !S[el.dataset.k] }), rule: (el) => setMc({ rule: el.dataset.k }),
    vol: () => openForm({ title: 'Equity volatility', sub: 'How much equity returns swing from year to year (standard deviation). Index funds near 15%; small and mid caps higher.', fields: [{ name: 'v', label: 'Volatility', type: 'pct', required: true, min: 1, max: 60 }], values: { v: S.equityVol ?? plan.assumptions.vol.equity }, onSave: (v) => setMc({ equityVol: v.v }) }),
    mcset: () => openMcSettings(plan, S, setMc),
    crash: (el) => { ui.crashSize = Number(el.dataset.n); ui.crashFor = null; X.redraw(); }, crashy: (el) => { ui.crashYears = Number(el.dataset.n); ui.crashFor = null; X.redraw(); },
    age: (el) => FS.edit('settings', (st) => { st.retireAge = Number(el.dataset.age); return st; }, { immediate: true }),
    hpick: (el) => { const i = Number(el.dataset.i); ui.compare = ui.compare.includes(i) ? ui.compare.filter((x) => x !== i) : [...ui.compare, i].slice(-2); X.redraw(); },
    compare: () => compareRuns(history[ui.compare[0]], history[ui.compare[1]], C),
  } } };
}

function openMcSettings(plan, S, setMc) {
  openForm({ title: 'Monte Carlo settings', sub: 'Defaults suit most plans. Changes re-run the simulation.', values: { fixedSeed: S.fixedSeed !== false, seed: S.seed, flexCut: S.flexCut ?? 10, flexTrigger: Math.abs(S.flexTrigger ?? 5), threshold: plan.assumptions.successThreshold ?? 80, inflationVol: plan.assumptions.inflationVol, hybridVol: plan.assumptions.vol.hybrid, debtVol: plan.assumptions.vol.debt, npsVol: plan.assumptions.vol.nps },
    fields: [{ type: 'title', text: 'Run' }, { name: 'fixedSeed', type: 'toggle', hint: 'Fixed random seed (same result every time)' }, { name: 'seed', label: 'Seed', type: 'num', min: 1, show: (v) => v.fixedSeed },
      { type: 'row', fields: [{ name: 'flexCut', label: 'Flexible cut', type: 'pct', min: 0, max: 50 }, { name: 'flexTrigger', label: 'After a fall of', type: 'pct', min: 0, max: 50 }] },
      { name: 'threshold', label: 'Success threshold', type: 'pct', min: 50, max: 99, help: 'The share of runs that must succeed to count as on track' },
      { type: 'title', text: 'Volatility (yearly swing)' }, { type: 'row', fields: [{ name: 'hybridVol', label: 'Hybrid', type: 'pct', min: 0, max: 40 }, { name: 'debtVol', label: 'Debt', type: 'pct', min: 0, max: 20 }] },
      { type: 'row', fields: [{ name: 'npsVol', label: 'NPS', type: 'pct', min: 0, max: 40 }, { name: 'inflationVol', label: 'Inflation', type: 'pct', min: 0, max: 8 }] }, { type: 'note', text: 'EMIs and premiums stay fixed. Correlation between asset classes follows each class\'s market sensitivity.' }],
    onSave: (v) => { setMc({ fixedSeed: v.fixedSeed, seed: v.seed ?? S.seed, flexCut: v.flexCut, flexTrigger: -Math.abs(v.flexTrigger) }); FS.edit('assumptions', (a) => { a.successThreshold = v.threshold; a.inflationVol = v.inflationVol; a.vol.hybrid = v.hybridVol; a.vol.debt = v.debtVol; a.vol.nps = v.npsVol; return a; }, { immediate: true }); } });
}
function compareRuns(a, b, C) {
  if (!a || !b) return; const row = (l, x, y, f = (v) => v) => h`<tr><td>${l}</td><td>${f(x)}</td><td>${f(y)}</td></tr>`;
  const s = sheet(h`<div class="fx-sheet-h"><h1>Compare runs</h1><button class="iconbtn" data-act="close" aria-label="Close">${IC.close}</button></div><div class="fx-scroll"><table class="fx-table"><thead><tr><th></th><th>Run A</th><th>Run B</th></tr></thead><tbody>${row('Success', a.success, b.success, (v) => `${Math.round(v * 100)}%`)}${row('Runs', a.paths, b.paths, (v) => v.toLocaleString('en-IN'))}${row('Retire age', a.retireAge, b.retireAge)}${row('Equity volatility', a.equityVol, b.equityVol, (v) => `±${Math.round(v)}%`)}${row('Withdrawals', a.rule, b.rule)}${row('Sequence risk', a.seq, b.seq, (v) => (v ? 'on' : 'off'))}${row('Life events', a.events, b.events, (v) => (v ? 'on' : 'off'))}${row('Corpus 10th pct', a.p10, b.p10, (v) => inrC(C(v)))}${row('Corpus median', a.p50, b.p50, (v) => inrC(C(v)))}${row('Corpus 90th pct', a.p90, b.p90, (v) => inrC(C(v)))}</tbody></table></div><button class="fx-btn" data-act="close">Close</button>`, {});
}
export { raw, chip, tile, note, head, openInfo, inr };
