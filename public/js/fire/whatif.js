// What-if sheet: try changes and see the result live, without saving. "Apply to plan" writes them into the plan.
import { h, raw, sheet, IC, statusChip, toast, errToast } from './ui.js';
import * as FS from './store.js';
import * as X from './ctx.js';
import { inr, inrC, pc, pp } from './format.js';

export function openWhatIf(prefill = {}) {
  const plan = X.getPlan(), base = X.run(), now = base.meta;
  const st = { retireAge: prefill.retireAge ?? now.retireAge, extraMonthly: prefill.extraMonthly ?? 0, spendPct: prefill.spendPct ?? 0, equityDelta: prefill.equityReturnDeltaPct ?? 0, inflDelta: prefill.inflationDeltaPct ?? 0, incomeDelta: prefill.incomeGrowthDeltaPct ?? 0, scenarioId: prefill.scenarioId ?? plan.settings.activeScenarioId };
  if (prefill.spendCutMonthly) st.spendPct = -Math.round((prefill.spendCutMonthly / Math.max(1, base.target.monthlyToday)) * 100);
  const overrides = () => ({ extraMonthly: st.extraMonthly || undefined, retireSpendFactor: 1 + st.spendPct / 100, equityReturnDeltaPct: st.equityDelta, inflationDeltaPct: st.inflDelta, incomeGrowthDeltaPct: st.incomeDelta });
  const compute = () => X.run({ retireAge: st.retireAge, scenarioId: st.scenarioId, overrides: overrides() });
  const slider = (key, label, min, max, step, fmt, hint = '') => h`<div class="fx-f"><div class="fx-row fx-between"><label style="text-transform:none;letter-spacing:0;font-size:15px;color:var(--text);font-weight:700">${label}</label><b data-v="${key}" class="pur">${fmt(st[key])}</b></div><input type="range" class="fx-slider" data-k="${key}" min="${min}" max="${max}" step="${step}" value="${st[key]}" aria-label="${label}">${hint ? h`<div class="fx-help">${hint}</div>` : ''}</div>`;
  const result = () => {
    const r = compute(), g = r.gap, b = base.gap, d = g.amount - b.amount;
    return h`<div class="fx-card ${g.amount > 0 ? 'bad' : 'good'}" style="padding:14px 16px"><div class="fx-row fx-between" style="align-items:flex-start"><div><div class="fx-sub">${g.amount > 0 ? 'Shortfall' : 'Surplus'} with these changes</div><div class="fx-mid ${g.amount > 0 ? 'bad' : 'ok'}">${inr(Math.abs(g.amount))}</div>
      <div class="fx-sub">${d === 0 ? 'Same as your plan' : d < 0 ? h`<span class="ok">${inr(-d)} better than now</span>` : h`<span class="bad">${inr(d)} worse than now</span>`}</div></div><div class="fx-right">${statusChip(g.status)}<div class="fx-sub" style="margin-top:6px">${pc(g.pct)} funded · age ${r.meta.retireAge}</div></div></div></div>`;
  };
  const body = () => h`<div class="fx-sheet-h"><div><h1>What if…</h1><div class="fx-sub">Nothing is saved until you apply it</div></div><button class="iconbtn" data-act="close" aria-label="Close">${IC.close}</button></div>
    <div id="wi-res">${result()}</div>
    <div class="col" style="gap:14px">
      <div class="fx-f"><div class="fx-row fx-between"><label style="text-transform:none;letter-spacing:0;font-size:15px;color:var(--text);font-weight:700">Retirement age</label><div class="fx-step"><button data-act="age" data-d="-1" aria-label="Earlier">−</button><span class="n" data-v="retireAge">${st.retireAge}</span><button data-act="age" data-d="1" aria-label="Later">+</button></div></div></div>
      ${slider('extraMonthly', 'Extra monthly saving', 0, 150000, 1000, (v) => `+${inr(v)}`, 'Added to your investing and stepped up each year')}
      ${slider('spendPct', 'Retirement spending', -40, 40, 1, (v) => `${v > 0 ? '+' : ''}${v}%`, `Today ${inr(base.target.monthlyToday)} a month`)}
      ${slider('equityDelta', 'Equity return', -5, 5, 0.5, (v) => `${v > 0 ? '+' : ''}${v} pts`)}
      ${slider('inflDelta', 'Inflation', -2, 3, 0.5, (v) => `${v > 0 ? '+' : ''}${v} pts`)}
      ${slider('incomeDelta', 'Income & saving growth', -5, 8, 0.5, (v) => `${v > 0 ? '+' : ''}${v} pts`)}
      <div class="fx-f"><label for="wi-sc">Scenario</label><select class="fx-in" id="wi-sc">${X.getPlan().scenarios.length >= 0 ? [['optimistic', 'Optimistic'], ['base', 'Base'], ['pessimistic', 'Pessimistic'], ...plan.scenarios.map((s) => [s.id, s.name])].map(([id, n]) => h`<option value="${id}" ${id === st.scenarioId ? raw('selected') : ''}>${n}</option>`) : ''}</select></div></div>
    <div class="fx-row"><button class="fx-btn ghost" data-act="reset" style="flex:1">Reset</button><button class="fx-btn" data-act="apply" style="flex:2">Apply to plan</button></div>`;
  const s = sheet(body(), { click: {
    age: (el) => { st.retireAge = Math.max(35, Math.min(70, st.retireAge + Number(el.dataset.d))); s.el.querySelector('[data-v=retireAge]').textContent = st.retireAge; upd(); },
    reset: () => { Object.assign(st, { retireAge: now.retireAge, extraMonthly: 0, spendPct: 0, equityDelta: 0, inflDelta: 0, incomeDelta: 0, scenarioId: plan.settings.activeScenarioId }); redraw(); },
    apply: () => {
      try {
        FS.edit('profile', (p) => { p.people[0].retireAge = st.retireAge; return p; });
        if (st.extraMonthly) FS.edit('goals', (gs) => gs.map((g) => (g.kind === 'retirement' ? { ...g, monthlyAlloc: (Number(g.monthlyAlloc) || 0) + st.extraMonthly, stepUpPct: g.stepUpPct ?? plan.assumptions.salaryGrowth } : g)));
        if (st.spendPct) FS.edit('spending', (sp) => { sp.retirement = { ...sp.retirement, monthly: Math.round(base.target.monthlyToday * (1 + st.spendPct / 100)) }; return sp; });
        if (st.equityDelta || st.inflDelta || st.incomeDelta) FS.edit('assumptions', (a) => { a.returns.equity += st.equityDelta; for (const k of Object.keys(a.inflation)) a.inflation[k] += st.inflDelta; a.salaryGrowth += st.incomeDelta; return a; });
        FS.edit('settings', (x) => { x.retireAge = null; x.activeScenarioId = st.scenarioId; return x; }, { immediate: true });
        s.close(); toast('Applied to your plan');
      } catch (e) { errToast(e); }
    },
  } });
  const upd = () => { const el = s.el.querySelector('#wi-res'); if (el) el.innerHTML = result().s; };
  const redraw = () => { const sh = s.el.querySelector('.sheet'); sh.innerHTML = `<div class="grab"></div>${body().s}`; };
  s.el.addEventListener('input', (e) => { const k = e.target.dataset?.k; if (!k) return; st[k] = Number(e.target.value); const lab = s.el.querySelector(`[data-v="${k}"]`); const f = { extraMonthly: (v) => `+${inr(v)}`, spendPct: (v) => `${v > 0 ? '+' : ''}${v}%`, equityDelta: (v) => `${v > 0 ? '+' : ''}${v} pts`, inflDelta: (v) => `${v > 0 ? '+' : ''}${v} pts`, incomeDelta: (v) => `${v > 0 ? '+' : ''}${v} pts` }[k]; if (lab) lab.textContent = f(st[k]); upd(); });
  s.el.addEventListener('change', (e) => { if (e.target.id === 'wi-sc') { st.scenarioId = e.target.value; upd(); } });
  return s;
}
export { inrC, pp };
