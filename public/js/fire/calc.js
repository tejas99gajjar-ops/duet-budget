// Screen: "How we worked this out". The same three methods, told as a story in plain words with the household's own numbers.
// Simple = the story only. Full detail = the story plus the year-by-year tables behind it.
import { h, bind, IC, chip, statusChip, tile, note, bar, head, fxNav, toast, openInfo } from './ui.js';
import { html } from '../core.js';
import * as FS from './store.js';
import * as X from './ctx.js';
import { CLASS_INFO, CLASSES, GROUP_LABEL } from './defaults.js';
import { compareScenarios } from './engine.js';
import { modelChecks } from './checks.js';
import { download } from './io.js';
import { inr, inrC, inrF, pc } from './format.js';

let full = false;
const sum = (a) => a.reduce((s, x) => s + x, 0);
const GLOSSARY = [
  ['Today\'s money', 'Every rupee amount is shown as if prices had not risen. ₹1 crore in 2046 buys far less than ₹1 crore today, so we convert it back to what it would feel like now.'],
  ['Inflation', 'How fast prices rise each year. At 6%, something that costs ₹100 today costs about ₹320 in 20 years.'],
  ['Real return', 'What an investment earns after taking away inflation. A fund growing 9.4% when prices rise 6% really grows by about 3.2%.'],
  ['Corpus', 'The pot of investments you live off after you stop working.'],
  ['Present value', 'What a future amount is worth today. ₹1 lakh needed in 10 years is worth less than ₹1 lakh now because the money can grow while it waits.'],
  ['Withdrawal rate', 'The share of the corpus you take out each year. Taking 3.5% of ₹3 crore means ₹10.5 lakh a year.'],
  ['Tax gross-up', 'Selling investments to pay bills triggers tax on the gains. We add a little extra to the target so what is left after tax still covers the bill.'],
  ['SIP', 'A fixed amount invested every month.'],
  ['Monte Carlo', 'Running your plan thousands of times with random good and bad markets, to see how often it survives. It shows risk, which a single straight-line answer cannot.'],
];
const card = (title, ...body) => h`<div class="fx-card"><div class="fx-lbl" style="margin-bottom:10px">${title}</div>${body}</div>`;
const say = (...t) => h`<p class="fx-say">${t}</p>`;
const num = (v) => h`<b>${v}</b>`;
const table = (cols, rows) => h`<div class="fx-table-wrap"><table class="fx-table"><thead><tr>${cols.map((c, i) => h`<th style="text-align:${i ? 'right' : 'left'}">${c}</th>`)}</tr></thead><tbody>${rows.map((r) => h`<tr>${r.map((c, i) => h`<td style="text-align:${i ? 'right' : 'left'}">${c}</td>`)}</tr>`)}</tbody></table></div>`;
const more = (...body) => (full ? h`<div class="fx-more">${body}</div>` : '');
const story = (n, title, ...body) => h`<div class="fx-story"><span class="fx-num">${n}</span><div class="grow"><div class="fx-q">${title}</div>${body}</div></div>`;

export async function calc(root) {
  const plan = X.getPlan(), res = X.run(), t = res.target, m = res.meta, A = plan.assumptions, g = res.gap, mc = FS.fs.mc, c = g.amount > 0 ? X.close() : null;
  const mod = res.model, retYrs = mod.horizonAge - m.retireAge, checks = modelChecks(plan, res, mc), sc = compareScenarios(plan, { today: X.today() });
  const people = plan.profile.people, you = people[0].name || 'You';
  const sample = (rows) => (full || rows.length <= 5 ? rows : [...rows.slice(0, 3), null, rows[rows.length - 1]]);
  const tRows = sample(t.rows).map((r) => (r ? [`${r.year} (age ${r.age})`, inrC(r.spend), inrC(r.premiums + r.events), inrC(r.passive), inrC(r.gross), inrC(r.pv)] : ['…', '', '', '', '', '']));
  const pRows = sample(res.projection.rows.filter((r) => r.year <= m.retireYear)).map((r) => (r ? [`${r.year}`, inrC(r.income), inrC(r.spending + r.emi), inrC(r.saving), inrC(r.corpus ?? sum(CLASSES.map((k) => r.classes[k] || 0)))] : ['…', '', '', '', '']));
  const pots = res.projection.potsToday, potRows = CLASSES.filter((k) => pots[k] > 0).map((k) => [CLASS_INFO[k].label, inrC(pots[k]), `${A.returns[k]}%`, `${(((1 + A.returns[k] / 100) / (1 + A.inflation.general / 100) - 1) * 100).toFixed(1)}%`]);
  const mix = Object.entries(A.retirementAllocation).filter(([, v]) => v > 0).map(([k, v]) => `${CLASS_INFO[k].short} ${v}%`).join(', ');
  const shares = Object.entries(mod.shares).filter(([, v]) => v > 0.001).map(([k, v]) => `${GROUP_LABEL[k] || k} ${Math.round(v * 100)}%`).join(', ');
  const lvl = g.amount > 0 ? 'bad' : 'ok';

  html(root, h`<div class="fx">${head({ kicker: 'DETAIL · CALCULATION', title: 'How we worked this out', back: '#/fire/detail', sub: 'In plain words, using your own numbers.' })}
    <div class="fx-seg"><button class="${full ? '' : 'on'}" data-act="lvl" data-k="0">Simple</button><button class="${full ? 'on' : ''}" data-act="lvl" data-k="1">Show the tables</button></div>

    <div class="fx-card glow"><div class="fx-row fx-between"><span class="fx-lbl">THE SHORT ANSWER</span>${statusChip(g.status)}</div>
      <p class="fx-say" style="font-size:17px;margin-top:10px">To retire at <b>${m.retireAge}</b> (in ${m.retireYear}) you need about <b>${inr(g.target)}</b>. At today's pace you will have about <b>${inr(g.projected)}</b>.
      ${g.amount > 0 ? h` That leaves a gap of <b class="bad">${inr(g.amount)}</b>.` : h` That leaves <b class="ok">${inr(-g.amount)}</b> to spare.`}</p>
      <div style="margin-top:10px">${bar(Math.min(1, g.pct), g.amount > 0 ? 'var(--fx-warn)' : 'var(--fx-ok)')}</div><div class="fx-sub" style="margin-top:6px">${pc(g.pct)} of the way there · all amounts in today's money</div></div>

    ${card(`IS ANYTHING OFF? (${checks.filter((x) => x.level !== 'good').length})`, h`<div class="col" style="gap:10px">${checks.map((k) => h`<${k.to ? 'a' : 'div'} class="fx-check ${k.level}" ${k.to ? h`href="${k.to}"` : ''}><span class="ic">${k.icon}</span><span class="grow"><b>${k.title}</b><div class="fx-sub">${k.text}</div></span>${k.to ? IC.chev : ''}</${k.to ? 'a' : 'div'}>`)}</div>`)}

    <div class="fx-lbl" style="margin:6px 0 -6px">METHOD 1 · THE STRAIGHT LINE</div>
    <div class="fx-card"><div class="col" style="gap:18px">
      ${story(1, 'What will life cost once you stop working?', say(`Today your household spends `, num(inrF(m.spendNow)), ` a month.`, A.unrecordedCostsPct ? ` We add ${A.unrecordedCostsPct}% for yearly costs that never show up in a normal month, like insurance renewals, trips and gifts.` : '', ` After retirement we assume `, num(inrF(t.monthlyToday)), ` a month in today's prices, which is `, num(inr(t.annualToday)), ` a year.`), say(`That money is split by what it is spent on: ${shares}. Healthcare and education prices rise faster than everyday prices, so they are tracked separately (${A.inflation.medical}% and ${A.inflation.education}% a year, against ${A.inflation.general}% for everything else). Healthcare also keeps climbing with age.`))}
      ${story(2, `How much money pays for ${retYrs} years of that?`, say(`You need money for every year from age ${m.retireAge} to ${mod.horizonAge}. While you are retired the money keeps earning a little, about `, num(`${(t.rRet * 100).toFixed(1)}%`), ` a year above inflation (your retirement mix is ${mix}). So a rupee needed 20 years into retirement only has to be set aside as a smaller amount today.`), say(`We take each year's bill, shrink it by what the waiting money earns, and add them all up. We also add about ${Math.round((t.grossUp - 1) * 100)}% because selling investments triggers tax. The total is your target: `, num(inr(t.total)), `.`),
        more(table(['Year (age)', 'Costs', 'Premiums, events', 'Other income', 'Withdraw', 'Worth today'], tRows)))}
      ${story(3, 'Does a simple rule of thumb agree?', say(`A common shortcut is yearly spending divided by a safe withdrawal rate. At ${t.swr}% that is `, num(inr(t.classicAt)), `. `, t.total < t.classicAt ? `Our year-by-year number is lower because it lets the money run down to zero at ${mod.horizonAge} instead of leaving it untouched forever, so treat the rule of thumb as the cautious end.` : `Our year-by-year number is the more careful of the two.`), more(table(['Withdrawal rate', 'Corpus needed'], Object.entries(t.classic).map(([r, v]) => [`${r}%`, inr(v)]))))}
      ${story(4, 'What will you have by then?', say(`You hold `, num(inr(res.projection.potsTotal)), ` today. Each kind of investment grows at its own pace, and we take away inflation to stay in today's money. You also keep investing `, num(inrF(m.sipNow)), ` a month, and the plan follows your loans, baby, house and other events year by year, including any year your pay does not cover costs.`), more(table(['Investment', 'Value now', 'Grows', 'After inflation'], potRows), h`<div style="height:10px"></div>`, table(['Year', 'Income', 'Costs + EMIs', 'Invested', 'Pots'], pRows)), say(`Added up at age ${m.retireAge}, you are on course for `, num(inr(g.projected)), `.`))}
      ${story(5, 'So where does that leave you?', say(`Target `, num(inr(g.target)), `, projected `, num(inr(g.projected)), `: `, h`<b class="${lvl}">${g.amount > 0 ? `a gap of ${inr(g.amount)}` : `${inr(-g.amount)} to spare`}</b>`, `.`), c ? say(`Any one of these closes it on its own:`) : '',
        c ? h`<ul class="fx-ul"><li>Invest about <b>${c.extraMonthly ? inrF(c.extraMonthly) : '—'}</b> more every month (money you would need to free up from spending or earn extra, since your free cash today is ${inrF(Math.max(0, m.freeCash))} a month).</li><li>Spend about <b>${c.lowerSpend ? inrF(c.lowerSpend) : '—'}</b> less every month once retired.</li><li>Retire later, at age <b>${c.laterAge ?? 'beyond 60'}</b>.</li></ul>` : '')}
    </div></div>

    <div class="fx-lbl" style="margin:6px 0 -6px">METHOD 2 · WHAT IF MARKETS ARE BUMPY?</div>
    <div class="fx-card"><div class="col" style="gap:18px">
      ${story(1, 'Replaying your plan thousands of times', say(`Markets never give the same return every year. We replay your plan ${mc ? mc.paths.toLocaleString('en-IN') : '10,000'} times, each with its own random good and bad years, inflation and medical surprises, then count how often your money lasts until ${mod.horizonAge}.`), mc ? say(`Result: `, num(`${Math.round(mc.success * 100)} out of 100`), ` futures last. You asked for at least `, num(`${A.successThreshold ?? 80}`), `. ${mc.success * 100 >= (A.successThreshold ?? 80) ? 'You clear that bar.' : 'You are below that bar, so a bad sequence of early years could break the plan.'}`) : h`<p class="fx-say">Not run yet. Open <a class="fx-link" href="#/fire/detail/mc">Monte Carlo</a> and tap Run.</p>`, more(mc ? table(['Detail', 'Value'], [['Futures simulated', mc.paths.toLocaleString('en-IN')], ['Random seed', String(mc.seed)], ['Survived', (mc.successes ?? Math.round(mc.success * mc.paths)).toLocaleString('en-IN')]]) : ''))}
    </div></div>

    <div class="fx-lbl" style="margin:6px 0 -6px">METHOD 3 · WHAT IF LIFE GOES DIFFERENTLY?</div>
    <div class="fx-card"><div class="col" style="gap:14px">
      ${story(1, 'The same plan in different worlds', say(`Each scenario changes a few things, for example a second income, lower returns or higher spending, and re-runs everything. This shows how sensitive your answer is.`), table(['Scenario', 'Earliest retirement', 'Gap'], sc.map((s) => [`${s.scenario.icon || ''} ${s.scenario.name}`, s.earliestAge ? `Age ${s.earliestAge}` : 'Not before 60', h`<span class="${s.gap > 0 ? 'bad' : 'ok'}">${s.gap > 0 ? inrC(s.gap) : `${inrC(-s.gap)} spare`}</span>`])), h`<a class="fx-link" href="#/fire/detail/scen" style="display:inline-block;margin-top:8px">Try your own what-if →</a>`)}
    </div></div>

    ${card('WORDS EXPLAINED', h`<div class="fx-list">${GLOSSARY.map(([k, v], i) => h`<button class="fx-li" data-act="gl" data-i="${i}" style="padding:12px 0"><span class="grow"><b>${k}</b></span>${IC.chev}</button>`)}</div>`)}
    <div class="fx-row"><button class="fx-btn ghost" data-act="csv" style="flex:1">Download as CSV</button></div>
    ${note('ⓘ', 'These are estimates from the assumptions you set. They are not financial, tax or legal advice.')}${fxNav('overview')}</div>`);
  bind(root, { click: {
    lvl: (el) => { full = el.dataset.k === '1'; X.redraw(); },
    gl: (el) => { const [k, v] = GLOSSARY[Number(el.dataset.i)]; openInfo(k, h`<p class="fx-say">${v}</p>`); },
    csv: () => { const L = ['Section,Year,Age,Costs,Premiums+Events,Other income,Withdrawal,Worth today', ...t.rows.map((r) => ['Target', r.year, r.age, r.spend, r.premiums + r.events, r.passive, r.gross, r.pv].map((v) => (typeof v === 'number' ? Math.round(v) : v)).join(',')), '', 'Section,Year,Age,Invested,Cash flow,Retirement corpus', ...res.projection.rows.map((r) => ['Projection', r.year, r.age, r.saving, r.net, r.corpus ?? ''].map((v) => (typeof v === 'number' ? Math.round(v) : v)).join(','))]; download(`fire-calculation-${X.today()}.csv`, L.join('\n'), 'text/csv'); toast('CSV downloaded'); },
  } });
  void chip; void tile; void FS; void you;
}
