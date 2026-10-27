// Screen: Show detailed calculation. Every step of all three methods with your own numbers, in Simple or Full detail.
import { h, bind, IC, chip, tile, note, head, fxNav, toast } from './ui.js';
import { html } from '../core.js';
import * as FS from './store.js';
import * as X from './ctx.js';
import { CLASS_INFO, CLASSES, GROUP_LABEL } from './defaults.js';
import { compareScenarios } from './engine.js';
import { download } from './io.js';
import { inr, inrC, inrF, pc, pp } from './format.js';

let full = false;
const sum = (a) => a.reduce((s, x) => s + x, 0);
const step = (n, title, sub, body) => h`<div class="fx-step-card"><div class="fx-row" style="gap:12px;align-items:flex-start"><span class="fx-ico" style="background:var(--fx);color:#fff;font-weight:800">${n}</span><div class="grow" style="min-width:0"><b style="font-size:18px">${title}</b>${sub ? h`<div class="fx-sub" style="margin-top:2px">${sub}</div>` : ''}</div></div><div style="margin-top:12px">${body}</div></div>`;
const kv = (rows) => h`<div>${rows.map(([k, v]) => (k === '' ? h`<div class="fx-sub" style="padding:0 0 10px;margin-top:-4px">${v}</div>` : h`<div class="fx-kv"><span>${k}</span><b>${v}</b></div>`))}</div>`;
const table = (cols, rows) => h`<div style="overflow-x:auto;margin:0 -4px"><table class="fx-table" style="width:100%;min-width:${cols.length * 76}px"><thead><tr>${cols.map((c, i) => h`<th style="text-align:${i ? 'right' : 'left'}">${c}</th>`)}</tr></thead><tbody>${rows.map((r) => h`<tr>${r.map((c, i) => h`<td style="text-align:${i ? 'right' : 'left'}">${c}</td>`)}</tr>`)}</tbody></table></div>`;

export async function calc(root) {
  const plan = X.getPlan(), res = X.run(), t = res.target, m = res.meta, A = plan.assumptions, g = res.gap, c = g.amount > 0 ? X.close() : null, mc = FS.fs.mc;
  const sample = (rows) => (full || rows.length <= 5 ? rows : [...rows.slice(0, 3), null, rows[rows.length - 1]]);
  const tRows = sample(t.rows).map((r) => (r ? [`${r.year} (${r.age})`, inrC(r.spend), inrC(r.premiums + r.events), inrC(r.passive), inrC(r.gross), r.discount.toFixed(3), inrC(r.pv)] : ['…', '', '', '', '', '', '']));
  const pRows = res.projection.rows.filter((r) => r.year < m.retireYear + 1); const pS = sample(pRows).map((r) => (r ? [`${r.year}`, inrC(r.saving), inrC(r.net), inrC(sum(CLASSES.map((k) => r.classes[k] || 0))), r.corpus != null ? inrC(r.corpus) : '—'] : ['…', '', '', '', '']));
  const pots = res.projection.potsToday, potRows = CLASSES.filter((k) => pots[k] > 0).map((k) => [CLASS_INFO[k].label, inrC(pots[k]), `${A.returns[k]}%`]);
  const sc = compareScenarios(plan, { today: X.today() });
  html(root, h`<div class="fx">${head({ kicker: 'DETAIL · CALCULATION', title: 'How we calculated this', back: '#/fire/detail', sub: 'Every number comes from your inputs. Amounts are in today\'s rupees.' })}
    <div class="fx-seg"><button class="${full ? '' : 'on'}" data-act="lvl" data-k="0">Simple</button><button class="${full ? 'on' : ''}" data-act="lvl" data-k="1">Full detail</button></div>
    <div class="fx-tile" style="border:1.5px solid var(--fx)"><div class="fx-lbl">THE ANSWER</div><div class="fx-grid2" style="margin:8px 0"><div><div class="fx-sub">Needed</div><div class="fx-big" style="font-size:clamp(20px,6.4vw,26px)">${inr(g.target)}</div></div><div><div class="fx-sub">Projected</div><div class="fx-big" style="font-size:clamp(20px,6.4vw,26px)">${inr(g.projected)}</div></div></div><div class="${g.amount > 0 ? 'bad' : 'ok'}" style="font-weight:800">${g.amount > 0 ? `Gap of ${inr(g.amount)}` : `Surplus of ${inr(-g.amount)}`} · ${pc(g.pct)} funded</div></div>
    <div class="fx-lbl" style="margin:6px 0 -4px">METHOD 1 · DETERMINISTIC PROJECTION</div>
    ${step(1, 'Start from your retirement spending', `At age ${m.retireAge}, in ${m.retireYear}`, kv([['Monthly spending in retirement', inrF(t.monthlyToday)], ['× 12 months', inr(t.annualToday)], ...(full ? Object.entries(res.model.shares).filter(([, v]) => v > 0).map(([k, v]) => [`${GROUP_LABEL[k] || k} share`, pc(v, 0)]) : []), ['Inflation', `${A.inflation.general}%`], ['', "Kept out of the maths: we work in today's rupees"]]))}
    ${step(2, 'Add what retirement will also cost, take away passive income', 'Insurance premiums, life events after retirement, rent and dividends', kv([['Passive income at retirement', inr(t.passiveAtRet * 1)], ['Tax gross-up', `×${t.grossUp.toFixed(3)}`], ['', `${A.taxPct}% tax on the ${A.gainSharePct}% of each withdrawal that is gain`]]))}
    ${step(3, 'Bring each year back to today', `Real return in retirement ${(t.rRet * 100).toFixed(2)}% (portfolio ${t.retNom.toFixed(1)}% less inflation)`, h`<div class="fx-formula">Corpus = Σ over each year of<br>(spending − passive income) × tax gross-up ÷ (1 + ${(t.rRet * 100).toFixed(2)}%)<sup>years after retirement</sup></div><div style="margin-top:10px">${table(['Year (age)', 'Spend', 'Other', 'Passive', 'Gross', 'Disc.', 'PV'], tRows)}</div><div class="fx-kv" style="margin-top:6px"><span>Target corpus</span><b class="pur">${inr(t.total)}</b></div>`)}
    ${step(4, 'Cross-check with the classic rule', `Annual spending ÷ safe withdrawal rate (${t.swr}%)`, kv([['Annual spending', inr(t.annualToday)], [`÷ ${t.swr}%`, inr(t.classicAt)], ...(t.passiveAtRet ? [['After passive income', inr(t.classicAfterPassive)]] : []), ...(full ? Object.entries(t.classic).map(([r, v]) => [`At ${r}% withdrawal`, inr(v)]) : [])]))}
    ${step(5, 'Grow what you have and keep investing', 'Each holding grows at its own return; SIPs step up each year', h`${table(['Class', 'Value today', 'Return'], potRows)}${h`<div style="margin-top:10px">${table(['Year', 'Invested', 'Cash flow', 'All pots', 'Retirement'], pS)}</div>`}`)}
    ${step(6, 'Compare', '', kv([['Projected corpus at retirement', inr(g.projected)], ['Target corpus', inr(g.target)], [g.amount > 0 ? 'Gap' : 'Surplus', inr(Math.abs(g.amount))], ['Funded', pc(g.pct, 1)]]))}
    ${c ? step(7, 'What closes the gap', 'Any one of these on its own', kv([['Save more every month', c.extraMonthly ? inr(c.extraMonthly) : '—'], ['Retire later, at age', c.laterAge ?? '60+'], ['Or spend less each month', c.lowerSpend ? inr(c.lowerSpend) : '—']])) : ''}
    <div class="fx-lbl" style="margin:6px 0 -4px">METHOD 2 · MONTE CARLO</div>
    ${step(1, 'Run thousands of possible futures', 'Returns, inflation and medical costs vary randomly in each', mc ? kv([['Futures simulated', mc.paths.toLocaleString('en-IN')], ['Money lasts to age ' + mc.horizonAge, pc(mc.success)], ['Seed (same seed = same answer)', String(mc.seed)], ...(full ? [['Runs that survived', mc.successes.toLocaleString('en-IN')]] : [])]) : h`<div class="fx-sub">Not run yet. Open <a class="fx-link" href="#/fire/detail/mc">Monte Carlo</a> and tap Run.</div>`)}
    <div class="fx-lbl" style="margin:6px 0 -4px">METHOD 3 · SCENARIOS</div>
    ${step(1, 'Same plan, different worlds', 'Each scenario overrides growth, spending or returns', table(['Scenario', 'Earliest age', 'Gap'], sc.map((s) => [`${s.scenario.icon || ''} ${s.scenario.name}`, s.earliestAge ?? '—', inrC(s.gap)])))}
    <div class="fx-row"><button class="fx-btn ghost" data-act="csv" style="flex:1">Download as CSV</button><button class="fx-btn ghost" data-act="back" style="flex:1">Back</button></div>
    ${note('ⓘ', 'Estimates only, based on your assumptions. They are not advice.')}${fxNav('overview')}</div>`);
  bind(root, { click: { lvl: (el) => { full = el.dataset.k === '1'; X.redraw(); }, back: () => history.back(),
    csv: () => { const L = ['Section,Year,Age,Spend,Premiums+Events,Passive,Gross withdrawal,Discount,Present value', ...t.rows.map((r) => ['Target', r.year, r.age, r.spend, r.premiums + r.events, r.passive, r.gross, r.discount, r.pv].map((v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v)).join(',')), '', 'Section,Year,Age,Invested,Cash flow,Retirement corpus', ...res.projection.rows.map((r) => ['Projection', r.year, r.age, r.saving, r.net, r.corpus ?? ''].map((v) => (typeof v === 'number' ? Math.round(v) : v)).join(','))]; download(`fire-calculation-${X.today()}.csv`, L.join('\n'), 'text/csv'); toast('CSV downloaded'); } } });
  void chip; void tile; void IC; void pp;
}
