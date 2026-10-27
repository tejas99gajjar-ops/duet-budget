// What-if lab: tap changes (they stack), see the effect at once, then save the combination as a scenario or apply it to the plan.
// Nothing is saved until you choose to. Sliders for fine control sit under "Fine-tune".
import { h, raw, sheet, IC, statusChip, toast, errToast } from './ui.js';
import * as FS from './store.js';
import * as X from './ctx.js';
import { earliestAge } from './engine.js';
import { inr, inrC, pc, pp } from './format.js';
import { uid } from './defaults.js';

const sign = (v, u = '') => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}${u}`;

export function openWhatIf(prefill = {}) {
  const plan = X.getPlan(), base = X.run(), now = base.meta, A = plan.assumptions, baseYear = now.baseYear;
  const people = plan.profile.people, partner = people[1];
  const existing = plan.scenarios.find((s) => s.overrides?.partnerWorks)?.overrides.partnerWorks;
  const eventChips = plan.events.filter((e) => e.enabled !== false && (Number(e.cost) || Number(e.annualCost)) && e.kind !== 'work_stop').slice(0, 4);
  const st = { retireAge: prefill.retireAge ?? now.retireAge, extraMonthly: prefill.extraMonthly ?? 0, spendPct: prefill.spendPct ?? 0, equityDelta: prefill.equityReturnDeltaPct ?? 0, inflDelta: prefill.inflationDeltaPct ?? 0, incomeDelta: prefill.incomeGrowthDeltaPct ?? 0,
    partner: null, skip: new Set(), scenarioId: prefill.scenarioId ?? plan.settings.activeScenarioId, open: false, grid: null };
  if (prefill.spendCutMonthly) st.spendPct = -Math.round((prefill.spendCutMonthly / Math.max(1, base.target.monthlyToday)) * 100);
  const pw = existing || { startYear: baseYear + 4, monthly: 30000, growthPct: 3 };
  const overrides = () => ({ extraMonthly: st.extraMonthly || undefined, retireSpendFactor: 1 + st.spendPct / 100, equityReturnDeltaPct: st.equityDelta, inflationDeltaPct: st.inflDelta, incomeGrowthDeltaPct: st.incomeDelta, partnerWorks: st.partner || undefined, eventsOffIds: st.skip.size ? [...st.skip] : undefined });
  const opts = () => ({ retireAge: st.retireAge, scenarioId: st.scenarioId, overrides: overrides() });
  const compute = () => X.run(opts());
  const changed = () => st.retireAge !== now.retireAge || st.extraMonthly || st.spendPct || st.equityDelta || st.inflDelta || st.incomeDelta || st.partner || st.skip.size || st.scenarioId !== plan.settings.activeScenarioId;

  // one-tap changes: [label, is it on?, switch it on, switch it off]
  const chips = [
    ['⏩ Retire 2 years later', () => st.retireAge === now.retireAge + 2, () => { st.retireAge = now.retireAge + 2; }, () => { st.retireAge = now.retireAge; }],
    ['⏪ Retire 2 years earlier', () => st.retireAge === now.retireAge - 2, () => { st.retireAge = now.retireAge - 2; }, () => { st.retireAge = now.retireAge; }],
    ['✂️ Spend 10% less when retired', () => st.spendPct === -10, () => { st.spendPct = -10; }, () => { st.spendPct = 0; }],
    ['💰 Invest ₹10,000 more a month', () => st.extraMonthly === 10000, () => { st.extraMonthly = 10000; }, () => { st.extraMonthly = 0; }],
    ['💰 Invest ₹25,000 more a month', () => st.extraMonthly === 25000, () => { st.extraMonthly = 25000; }, () => { st.extraMonthly = 0; }],
    ...(partner ? [[`👩‍💼 ${partner.name || 'Partner'} earns ₹${pw.monthly.toLocaleString('en-IN')} a month from ${pw.startYear}`, () => !!st.partner, () => { st.partner = { ...pw }; }, () => { st.partner = null; }]] : []),
    ['📈 Pay grows 2 points faster', () => st.incomeDelta === 2, () => { st.incomeDelta = 2; }, () => { st.incomeDelta = 0; }],
    ['📉 Markets 3 points worse', () => st.equityDelta === -3, () => { st.equityDelta = -3; }, () => { st.equityDelta = 0; }],
    ['🔥 Prices rise 2 points faster', () => st.inflDelta === 2, () => { st.inflDelta = 2; }, () => { st.inflDelta = 0; }],
    ...eventChips.map((e) => [`🚫 Skip: ${e.name}`, () => st.skip.has(e.id), () => st.skip.add(e.id), () => st.skip.delete(e.id)]),
  ];
  const label = () => {
    const parts = [];
    if (st.retireAge !== now.retireAge) parts.push(`Retire at ${st.retireAge}`); if (st.spendPct) parts.push(`Spend ${sign(st.spendPct, '%')}`); if (st.extraMonthly) parts.push(`Invest +${inrC(st.extraMonthly)}`);
    if (st.partner) parts.push(`${partner?.name || 'Partner'} works from ${st.partner.startYear}`); if (st.incomeDelta) parts.push(`Pay ${sign(st.incomeDelta, ' pts')}`); if (st.equityDelta) parts.push(`Markets ${sign(st.equityDelta, ' pts')}`);
    if (st.inflDelta) parts.push(`Prices ${sign(st.inflDelta, ' pts')}`); for (const id of st.skip) parts.push(`No ${plan.events.find((e) => e.id === id)?.name || 'event'}`);
    return parts.join(', ') || 'What-if';
  };

  const slider = (key, lab, min, max, step, fmt, hint = '') => h`<div class="fx-f"><div class="fx-row fx-between"><label style="text-transform:none;letter-spacing:0;font-size:15px;color:var(--text);font-weight:700">${lab}</label><b data-v="${key}" class="pur">${fmt(st[key])}</b></div><input type="range" class="fx-slider" data-k="${key}" min="${min}" max="${max}" step="${step}" value="${st[key]}" aria-label="${lab}">${hint ? h`<div class="fx-help">${hint}</div>` : ''}</div>`;
  const fmts = { extraMonthly: (v) => `+${inr(v)}`, spendPct: (v) => sign(v, '%'), equityDelta: (v) => sign(v, ' pts'), inflDelta: (v) => sign(v, ' pts'), incomeDelta: (v) => sign(v, ' pts') };

  const row = (l, a, b, better) => h`<div class="fx-wi-row"><span>${l}</span><span class="fx-sub">${a}</span><b class="${better == null ? '' : better ? 'ok' : 'bad'}">${b}</b></div>`;
  const result = () => {
    const r = compute(), g = r.gap, b = base.gap, d = g.amount - b.amount, same = !changed();
    const ea = st.grid != null ? st.grid : undefined;
    return h`<div class="fx-card ${g.amount > 0 ? 'bad' : 'good'}" style="padding:14px 16px"><div class="fx-row fx-between" style="align-items:flex-start;gap:10px"><div class="grow"><div class="fx-sub">${g.amount > 0 ? 'Shortfall' : 'Surplus'} with your changes</div><div class="fx-mid ${g.amount > 0 ? 'bad' : 'ok'}">${inr(Math.abs(g.amount))}</div>
      <div class="fx-sub">${same ? 'No changes yet. Tap something below.' : d === 0 ? 'Same as your plan' : d < 0 ? h`<span class="ok">${inr(-d)} better than now</span>` : h`<span class="bad">${inr(d)} worse than now</span>`}</div></div>${statusChip(g.status)}</div>
      <div class="fx-wi-grid"><div class="fx-wi-row head"><span></span><span>Now</span><span>With changes</span></div>${row('Needed', inrC(b.target), inrC(g.target), g.target <= b.target)}${row('You will have', inrC(b.projected), inrC(g.projected), g.projected >= b.projected)}${row('Funded', pc(b.pct), pc(g.pct), g.pct >= b.pct)}${row('Earliest retirement', st.base != null ? (st.base ? `Age ${st.base}` : '60+') : '…', ea === undefined ? '…' : ea ? `Age ${ea}` : '60+', ea === undefined || st.base == null ? null : (ea || 99) <= (st.base || 99))}</div></div>`;
  };
  const chipsHtml = () => h`<div class="fx-chips" role="group" aria-label="Quick changes">${chips.map(([l, on], i) => h`<button type="button" class="fx-opt fx-wi-chip ${on() ? 'on' : ''}" data-act="chip" data-i="${i}" aria-pressed="${on()}">${l}</button>`)}</div>`;
  const body = () => h`<div class="fx-sheet-h"><div><h1>What if…</h1><div class="fx-sub">Tap changes to stack them. Nothing is saved until you choose.</div></div><button class="iconbtn" data-act="close" aria-label="Close">${IC.close}</button></div>
    <div id="wi-res" class="fx-wi-sticky">${result()}</div>
    <div id="wi-chips">${chipsHtml()}</div>
    <button class="fx-link" data-act="fine" style="text-align:left">${st.open ? '▾' : '▸'} Fine-tune with sliders</button>
    ${st.open ? h`<div class="col" style="gap:14px"><div class="fx-f"><div class="fx-row fx-between"><label style="text-transform:none;letter-spacing:0;font-size:15px;color:var(--text);font-weight:700">Retirement age</label><div class="fx-step sm"><button data-act="age" data-d="-1" aria-label="Earlier">−</button><span class="n" data-v="retireAge">${st.retireAge}</span><button data-act="age" data-d="1" aria-label="Later">+</button></div></div></div>
      ${slider('extraMonthly', 'Extra monthly saving', 0, 150000, 1000, fmts.extraMonthly, 'Funded by earning more or spending less, so it is not treated as a cash shortfall')}${slider('spendPct', 'Retirement spending', -40, 40, 1, fmts.spendPct, `Today ${inr(base.target.monthlyToday)} a month`)}
      ${slider('equityDelta', 'Equity return', -5, 5, 0.5, fmts.equityDelta)}${slider('inflDelta', 'Inflation', -2, 3, 0.5, fmts.inflDelta)}${slider('incomeDelta', 'Income & saving growth', -5, 8, 0.5, fmts.incomeDelta)}</div>` : ''}
    <div class="fx-row" style="flex-wrap:wrap"><button class="fx-btn ghost" data-act="reset" style="flex:1 1 90px">Reset</button><button class="fx-btn ghost" data-act="save" style="flex:2 1 130px" ${changed() ? '' : 'disabled'}>Save as scenario</button><button class="fx-btn" data-act="apply" style="flex:2 1 130px" ${changed() ? '' : 'disabled'}>Apply to plan</button></div>`;

  let timer = null; const later = () => { clearTimeout(timer); timer = setTimeout(grid, 120); };
  const grid = () => { try { const g = X.grid({ scenarioId: st.scenarioId, overrides: overrides() }, 45, 60); st.grid = earliestAge(g) ?? 0; if (st.base == null) st.base = earliestAge(X.grid({}, 45, 60)) ?? 0; const el = s.el.querySelector('#wi-res'); if (el) el.innerHTML = result().s; } catch { /* the result card still shows */ } };
  const upd = () => { const el = s.el.querySelector('#wi-res'); if (el) el.innerHTML = result().s; const ch = s.el.querySelector('#wi-chips'); if (ch) ch.innerHTML = chipsHtml().s; const dis = !changed(); s.el.querySelectorAll('[data-act=save],[data-act=apply]').forEach((b) => { b.disabled = dis; }); later(); };
  const redraw = () => { const sh = s.el.querySelector('.sheet'), top = sh.scrollTop; sh.innerHTML = `<div class="grab"></div>${body().s}`; sh.scrollTop = top; later(); };
  const s = sheet(body(), { click: {
    chip: (el) => { const c = chips[Number(el.dataset.i)]; c[1]() ? c[3]() : c[2](); upd(); },
    fine: () => { st.open = !st.open; redraw(); },
    age: (el) => { st.retireAge = Math.max(35, Math.min(70, st.retireAge + Number(el.dataset.d))); s.el.querySelector('[data-v=retireAge]').textContent = st.retireAge; upd(); },
    reset: () => { Object.assign(st, { retireAge: now.retireAge, extraMonthly: 0, spendPct: 0, equityDelta: 0, inflDelta: 0, incomeDelta: 0, partner: null, skip: new Set(), scenarioId: plan.settings.activeScenarioId }); redraw(); },
    save: () => {
      try {
        const name = label(), ov = overrides(); for (const k of Object.keys(ov)) if (ov[k] === undefined || (k === 'retireSpendFactor' && ov[k] === 1) || ov[k] === 0) delete ov[k];
        if (st.retireAge !== now.retireAge) ov.retireAge = st.retireAge;
        FS.edit('scenarios', (l) => [...l, { id: uid('sc'), name: name.length > 40 ? `${name.slice(0, 38)}…` : name, icon: '🧪', desc: name, overrides: ov }], { immediate: true });
        s.close(); toast('Saved. Find it under Detail → Scenarios');
      } catch (e) { errToast(e); }
    },
    apply: () => {
      try {
        if (st.retireAge !== now.retireAge) FS.edit('profile', (p) => { p.people[0].retireAge = st.retireAge; return p; });
        if (st.extraMonthly) FS.edit('goals', (gs) => gs.map((g) => (g.kind === 'retirement' ? { ...g, monthlyAlloc: (Number(g.monthlyAlloc) || 0) + st.extraMonthly, stepUpPct: g.stepUpPct ?? A.salaryGrowth } : g)));
        if (st.spendPct) FS.edit('spending', (sp) => { sp.retirement = { ...sp.retirement, monthly: Math.round(base.target.monthlyToday * (1 + st.spendPct / 100)) }; return sp; });
        if (st.equityDelta || st.inflDelta || st.incomeDelta) FS.edit('assumptions', (a) => { a.returns.equity += st.equityDelta; for (const k of Object.keys(a.inflation)) a.inflation[k] += st.inflDelta; a.salaryGrowth += st.incomeDelta; return a; });
        if (st.skip.size) FS.edit('events', (l) => l.map((e) => (st.skip.has(e.id) ? { ...e, enabled: false } : e)));
        if (st.partner && partner) FS.edit('incomes', (l) => [...l, { id: uid('i'), person: partner.id, label: `${partner.name || 'Partner'} · Salary`, type: 'active', sourceTag: 'Salary', takeHome: st.partner.monthly, growthPct: st.partner.growthPct ?? 3, startDate: `${st.partner.startYear}-01`, source: 'entered' }]);
        FS.edit('settings', (x) => { x.retireAge = null; x.activeScenarioId = st.scenarioId; return x; }, { immediate: true });
        s.close(); toast('Applied to your plan');
      } catch (e) { errToast(e); }
    },
  } });
  s.el.addEventListener('input', (e) => { const k = e.target.dataset?.k; if (!k) return; st[k] = Number(e.target.value); const lab = s.el.querySelector(`[data-v="${k}"]`); if (lab && fmts[k]) lab.textContent = fmts[k](st[k]); upd(); });
  later();
  return s;
}
export { inrC, pp, raw };
