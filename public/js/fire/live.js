// Screen: Live tracking. What actually happened in Duet (this month, quarter, year, 12 months) against what the plan assumes.
import { h, bind, IC, chip, tile, note, bar, head, fxNav, srcChip } from './ui.js';
import { html } from '../core.js';
import * as X from './ctx.js';
import * as D from './duet.js';
import { SPEND_BUCKETS } from './defaults.js';
import { stackedBars, sparkline } from './charts.js';
import { inrC, inrF, pc } from './format.js';
import { openApplyDuet } from './duetsync.js';

const PERIODS = [['m', 'Month'], ['q', 'Quarter'], ['ytd', 'Year'], ['12m', '12 mo']];
let period = 'm';
const sum = (a) => a.reduce((s, x) => s + x, 0);

export function live(root) {
  const plan = X.getPlan(), res = X.run(), today = X.today();
  if (!D.hasDuet()) return html(root, h`<div class="fx">${head({ kicker: 'FIRE PLANNER', title: 'Live', sub: 'Real numbers from Duet' })}${note('ⓘ', 'Duet data is not loaded yet. Open the Dashboard once, then come back.')}${fxNav('live')}</div>`);
  const st = D.duetStats(plan, today, period), n = Math.max(1, st.monthsWithData || 1), m = res.meta;
  const planSpend = Number(plan.spending.currentMonthly) || sum((plan.spending.categories || []).map((c) => Number(c.monthly) || 0));
  const real = { income: st.totals.income, expense: st.totals.expense, invested: st.totals.invested }, per = { income: st.avg.income, expense: st.avg.expense, invested: st.avg.invested };
  const planned = { income: m.takeHome * n, expense: planSpend * n, invested: m.sipTake * n };
  const rate = real.income ? (real.income - real.expense) / real.income : null, planRate = m.takeHome ? (m.takeHome - planSpend) / m.takeHome : null;
  const props = D.proposals(plan, today), wallets = D.duetWallets(), invs = D.duetInvestments(), budgets = D.duetBudgets(plan), trend = D.savingsTrend(plan, today, 10).filter((r) => r.rate != null);
  const buckets = SPEND_BUCKETS.map((b) => { const act = st.totals.byBucket[b.id] || 0, plan_ = (plan.spending.categories || []).find((c) => c.id === b.id)?.monthly * n || 0; return { b, act, plan: plan_ }; }).filter((x) => x.act || x.plan);
  const diff = (a, p, good) => { if (!p) return ''; const d = a - p, ok = good === 'high' ? d >= 0 : d <= 0; return h`<span class="${ok ? 'ok' : 'bad'}" style="font-weight:700">${d >= 0 ? '+' : '−'}${inrC(Math.abs(d))}</span>`; };
  const bars = st.months.length > 1 ? stackedBars(st.months.map((x) => ({ label: x.key.slice(5), parts: [{ v: x.expense, color: '#F5A623' }, { v: x.invested, color: '#7C5FE6' }] })), {}) : null;
  const walletTotal = sum(wallets.map((w) => w.balance)), invValue = sum(invs.map((i) => i.value)), invCost = sum(invs.map((i) => i.cost));
  html(root, h`<div class="fx">${head({ kicker: 'FIRE PLANNER', title: 'Live', sub: 'Real numbers from Duet against your plan', right: srcChip('duet') })}
    <div class="fx-seg" role="tablist" style="display:grid;grid-template-columns:repeat(4,1fr)">${PERIODS.map(([k, l]) => h`<button role="tab" class="${period === k ? 'on' : ''}" aria-selected="${period === k}" data-act="per" data-k="${k}">${l}</button>`)}</div>
    ${!st.hasData ? note('ⓘ', 'No Duet entries in this period yet. Add income and expenses and they will appear here.') : h`
    <div class="fx-card"><div class="fx-lbl" style="margin-bottom:10px">CASH FLOW${st.monthsWithData > 1 ? ` · ${st.monthsWithData} MONTHS` : ''}</div>
      <div class="col" style="gap:10px">${[['Income', real.income, planned.income, 'high', 'var(--fx-ok)'], ['Spending', real.expense, planned.expense, 'low', '#F5A623'], ['Invested', real.invested, planned.invested, 'high', 'var(--fx)']].map(([l, a, p, g, c]) => h`<div class="fx-tile"><div class="fx-row fx-between"><b style="font-size:16px">${l}</b><b style="font-size:20px;color:${c}">${inrC(a)}</b></div><div class="fx-row fx-between fx-sub" style="margin-top:4px"><span>Plan ${inrC(p)}</span>${diff(a, p, g)}</div>${bar(p ? Math.min(1, a / p) : 0, c)}</div>`)}</div>
      <div class="fx-row fx-between" style="margin-top:14px"><span><div class="fx-lbl">SAVINGS RATE</div><b class="${rate == null ? '' : rate >= (planRate ?? 0) ? 'ok' : 'warn'}" style="font-size:26px">${rate == null ? '—' : pc(rate)}</b> <span class="fx-sub">plan ${planRate == null ? '—' : pc(planRate)}</span></span>${trend.length > 2 ? h`<span>${sparkline(trend.map((r) => r.rate), { w: 110 })}</span>` : ''}</div></div>
    ${bars ? h`<div class="fx-card"><div class="fx-lbl">SPENDING & INVESTING BY MONTH</div><div class="fx-chart">${bars}</div><div class="fx-legend"><span><i style="background:#F5A623"></i>Spending</span><span><i style="background:#7C5FE6"></i>Invested</span></div></div>` : ''}
    <div class="fx-card"><div class="fx-lbl" style="margin-bottom:10px">SPENDING VS PLAN</div><div class="col" style="gap:12px">${buckets.map(({ b, act, plan: p }) => { const over = p && act > p, frac = p ? act / p : act ? 1 : 0; return h`<div><div class="fx-row fx-between"><span>${b.icon} ${b.name}</span><span><b>${inrC(act)}</b><span class="fx-sub"> of ${inrC(p)}</span></span></div>${bar(Math.min(1, frac), over ? 'var(--fx-bad)' : frac > 0.85 ? '#F5A623' : 'var(--fx-ok)')}</div>`; })}${!buckets.length ? h`<div class="fx-sub">No spending recorded.</div>` : ''}</div>
      <div class="fx-sub" style="margin-top:10px"><a class="fx-link" href="#/fire/inputs/spending">Change how Duet categories map →</a></div></div>`}
    <div class="fx-card"><div class="fx-lbl" style="margin-bottom:10px">FROM DUET</div><div class="fx-list">
      <div class="fx-li"><span class="fx-ico">👛</span><span class="grow"><b>Wallets</b><div class="fx-sub">${wallets.length} wallet${wallets.length === 1 ? '' : 's'}</div></span><b>${inrC(walletTotal)}</b></div>
      <div class="fx-li"><span class="fx-ico">📈</span><span class="grow"><b>Portfolio</b><div class="fx-sub">${invs.length} holding${invs.length === 1 ? '' : 's'}${invCost ? ` · cost ${inrC(invCost)}` : ''}</div></span><b>${inrC(invValue)}</b></div>
      <div class="fx-li"><span class="fx-ico">🎯</span><span class="grow"><b>Monthly budgets</b><div class="fx-sub">${Object.keys(budgets).length ? `${Object.keys(budgets).length} categories` : 'None set'}</div></span><b>${inrC(sum(Object.values(budgets)))}</b></div></div></div>
    <div class="fx-card ghost fx-row fx-between" style="padding:14px 16px"><span><b class="blue">${props.length ? `${props.length} plan update${props.length > 1 ? 's' : ''} from Duet` : 'Plan matches Duet'}</b><div class="fx-sub">Average of the last 3 full months</div></span>${props.length ? h`<button class="fx-btn small" data-act="apply">Review</button>` : chip('ok', 'In sync')}</div>
    ${fxNav('live')}</div>`);
  bind(root, { click: { per: (el) => { period = el.dataset.k; X.redraw(); }, apply: () => openApplyDuet() } });
  void IC; void tile; void inrF; void per;
}
