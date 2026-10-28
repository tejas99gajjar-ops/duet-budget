// Screen: "How we worked this out". Three levels of detail for the same three methods, each told with everyday analogies and the household's own numbers:
//   Big picture = a story with almost no maths · Step by step = the story with worked examples · Every number = the year-by-year tables.
import { h, bind, IC, statusChip, tile, note, bar, head, fxNav, toast } from './ui.js';
import { html } from '../core.js';
import * as FS from './store.js';
import * as X from './ctx.js';
import { CLASS_INFO, CLASSES, GROUP_LABEL } from './defaults.js';
import { compareScenarios } from './engine.js';
import { modelChecks } from './checks.js';
import { download } from './io.js';
import { inr, inrC, inrF, pc } from './format.js';

let level = 1;           // 0 big picture · 1 step by step · 2 every number
const sum = (a) => a.reduce((s, x) => s + x, 0);
const say = (...t) => h`<p class="fx-say">${t}</p>`;
const num = (v) => h`<b>${v}</b>`;
const analogy = (...t) => h`<div class="fx-analogy"><span class="ic">🧠</span><div><b>Think of it like this</b><div>${t}</div></div></div>`;
const example = (title, ...body) => h`<div class="fx-example"><div class="fx-lbl" style="margin-bottom:6px">✏️ WORKED EXAMPLE · ${title}</div>${body}</div>`;
const table = (cols, rows) => h`<div class="fx-table-wrap"><table class="fx-table"><thead><tr>${cols.map((c, i) => h`<th style="text-align:${i ? 'right' : 'left'}">${c}</th>`)}</tr></thead><tbody>${rows.map((r) => h`<tr>${r.map((c, i) => h`<td style="text-align:${i ? 'right' : 'left'}">${c}</td>`)}</tr>`)}</tbody></table></div>`;
const story = (n, title, ...body) => h`<div class="fx-story"><span class="fx-num">${n}</span><div class="grow" style="min-width:0"><div class="fx-q">${title}</div>${body}</div></div>`;
const section = (title) => h`<div class="fx-lbl" style="margin:8px 0 -6px">${title}</div>`;

export async function calc(root) {
  const plan = X.getPlan(), res = X.run(), t = res.target, m = res.meta, A = plan.assumptions, g = res.gap, mc = FS.fs.mc, c = g.amount > 0 ? X.close() : null, mod = res.model;
  const retYrs = mod.horizonAge - m.retireAge, checks = modelChecks(plan, res, mc), sc = compareScenarios(plan, { today: X.today() });
  const shares = Object.entries(mod.shares).filter(([, v]) => v > 0.001).map(([k, v]) => `${GROUP_LABEL[k] || k} ${Math.round(v * 100)}%`).join(', ');
  const mix = Object.entries(A.retirementAllocation).filter(([, v]) => v > 0).map(([k, v]) => `${CLASS_INFO[k].short} ${v}%`).join(', ');
  const sample = (rows) => (level === 2 || rows.length <= 5 ? rows : [...rows.slice(0, 3), null, rows[rows.length - 1]]);
  const tRows = sample(t.rows).map((r) => (r ? [`${r.year} (age ${r.age})`, inrC(r.spend), inrC(r.premiums + r.events), inrC(r.passive), inrC(r.gross), inrC(r.pv)] : ['…', '', '', '', '', '']));
  const pRows = sample(res.projection.rows.filter((r) => r.year <= m.retireYear)).map((r) => (r ? [`${r.year}`, inrC(r.income), inrC(r.spending + r.emi), inrC(r.saving), inrC(r.corpus ?? sum(CLASSES.map((k) => r.classes[k] || 0)))] : ['…', '', '', '', '']));
  const pots = res.projection.potsToday, potRows = CLASSES.filter((k) => pots[k] > 0).map((k) => [CLASS_INFO[k].label, inrC(pots[k]), `${A.returns[k]}%`, `${(((1 + A.returns[k] / 100) / (1 + A.inflation.general / 100) - 1) * 100).toFixed(1)}%`]);
  const lvl = g.amount > 0 ? 'bad' : 'ok', real = (1 + t.rRet);

  // worked examples built from the household's own rows
  const r0 = t.rows[0], k = Math.min(10, t.rows.length - 1), rk = t.rows[k];
  const big = [...mod.holdings].filter((x) => !x.virtual && x.v0 > 0).sort((a, b) => b.v0 - a.v0)[0];
  const yrsTo = Math.max(1, Math.round(m.yearsToRet)), fv = big ? big.v0 * Math.pow(1 + big.rr, yrsTo) : 0;
  const sipH = plan.holdings.flatMap((x) => (x.sips || []).filter((s) => s.status !== 'paused' && s.status !== 'stopped' && Number(s.amount) > 0 && !s.followsIncome).map((s) => ({ x, s }))).sort((a, b) => b.s.amount - a.s.amount)[0];
  const mh = sipH && mod.holdings.find((q) => q.id === sipH.x.id), rr = mh?.rr || 0.03, sipFv = sipH ? sipH.s.amount * 12 * (rr ? (Math.pow(1 + rr, yrsTo) - 1) / rr : yrsTo) : 0;

  html(root, h`<div class="fx">${head({ kicker: 'DETAIL · CALCULATION', title: 'How we worked this out', back: '#/fire/detail', sub: 'In plain words, with your own numbers. Tap any underlined word.' })}
    <div class="fx-seg" role="tablist" aria-label="Level of detail">${[['Big picture', 0], ['Step by step', 1], ['Every number', 2]].map(([l, v]) => h`<button role="tab" class="${level === v ? 'on' : ''}" aria-selected="${level === v}" data-act="lvl" data-k="${v}">${l}</button>`)}</div>

    <div class="fx-card glow"><div class="fx-row fx-between"><span class="fx-lbl">THE SHORT ANSWER</span>${statusChip(g.status)}</div>
      <p class="fx-say" style="font-size:17px;margin-top:10px">To retire at <b>${m.retireAge}</b> (in ${m.retireYear}) you need about <b>${inr(g.target)}</b>. At today's pace you will have about <b>${inr(g.projected)}</b>.${g.amount > 0 ? h` That leaves a gap of <b class="bad">${inr(g.amount)}</b>.` : h` That leaves <b class="ok">${inr(-g.amount)}</b> to spare.`}</p>
      <div style="margin-top:10px">${bar(Math.min(1, g.pct), g.amount > 0 ? 'var(--fx-warn)' : 'var(--fx-ok)')}</div><div class="fx-sub" style="margin-top:6px">${pc(g.pct)} of the way there · all amounts in today's money</div></div>

    ${level === 0 ? h`
    ${section('THE WHOLE IDEA IN FIVE PICTURES')}
    <div class="fx-card"><div class="col" style="gap:20px">
      ${story(1, '🛣️ Retirement is a road trip with no petrol stations', say(`Once you stop working there is no pay coming in. Everything you spend for the next ${retYrs} years has to come from the tank you fill before you leave.`), analogy('Your tank is your pot of investments. The trip is every year from age ', num(m.retireAge), ' to ', num(mod.horizonAge), '.'))}
      ${story(2, '⛽ How much petrol do we need?', say(`We add up what every year of the trip will cost, then work out how big the tank must be today so that all of it is covered. For you that is `, num(inr(g.target)), `.`), analogy('A bill due in 20 years does not need to be saved in full today, because the money you put aside keeps growing while it waits.'))}
      ${story(3, '📈 How much petrol will we have?', say(`We start with what you hold now (`, num(inr(res.projection.potsTotal)), `), let each investment grow at its own speed, keep topping up with your SIPs, and take out the bumps like loans and the baby. You are on course for `, num(inr(g.projected)), `.`), analogy('Think of each investment as a separate fuel can that fills at its own pace. Shares fill fast but unevenly, debt funds slowly and steadily.'))}
      ${story(4, '🌧️ What if the weather turns?', say(`Real markets are bumpy. So we replay the trip thousands of times with random good and bad years and count how often you arrive. ${mc ? `For you, ${Math.round(mc.success * 100)} out of 100 trips make it.` : 'This test runs from the Overview.'}`), analogy('A weather forecast does not say "it will rain"; it says "30% chance of rain". The stress test gives your plan a chance of success the same way.'))}
      ${story(5, '🧭 What can we change?', say(g.amount > 0 ? 'To fill the gap you can add petrol (save more), drive slower (spend less after retirement), start the trip later, or earn more. Each is worked out for you.' : 'You have petrol to spare, so the levers show how much earlier you could set off.'), analogy('Every lever is a dial. The Guide shows which dial moves your answer the most.'))}
    </div></div>
    <a class="fx-btn ghost" href="#/fire/how/assumptions" style="text-align:center">See the assumptions that matter most</a>` : ''}

    ${level >= 1 ? h`
    ${section(`IS ANYTHING OFF? (${checks.filter((x) => x.level !== 'good').length})`)}
    <div class="fx-card"><div class="col" style="gap:10px">${checks.map((q) => h`<${q.to ? 'a' : 'div'} class="fx-check ${q.level}" ${q.to ? h`href="${q.to}"` : ''}><span class="ic">${q.icon}</span><span class="grow"><b>${q.title}</b><div class="fx-sub">${q.text}</div></span>${q.to ? IC.chev : ''}</${q.to ? 'a' : 'div'}>`)}</div></div>

    ${section('METHOD 1 · THE STRAIGHT LINE')}
    <div class="fx-card"><div class="col" style="gap:22px">
      ${story(1, 'What will life cost once you stop working?',
        say(`Today your household spends `, num(inrF(m.spendNow)), ` a month.`, A.unrecordedCostsPct ? ` We add ${A.unrecordedCostsPct}% for yearly costs that never show up in a normal month, like insurance renewals, trips and gifts.` : '', ` After retirement we assume `, num(inrF(t.monthlyToday)), ` a month in today's prices, which is `, num(inr(t.annualToday)), ` a year.`),
        say(`That money is split by what it is spent on: ${shares}. Healthcare and education prices rise faster than everyday prices, so they are tracked separately (${A.inflation.medical}% and ${A.inflation.education}% a year, against ${A.inflation.general}% for everything else). Healthcare also keeps climbing with age.`),
        analogy('Your grocery list for the whole trip, with the fuel price for each item rising at its own speed.'))}
      ${story(2, `How much money pays for ${retYrs} years of that?`,
        say(`You need money for every year from age ${m.retireAge} to ${mod.horizonAge}. While you are retired the money keeps earning about `, num(`${(t.rRet * 100).toFixed(1)}%`), ` a year above inflation (your retirement mix is ${mix}). So a rupee needed 20 years into retirement only has to be set aside as a smaller amount today.`),
        say(`We take each year's bill, shrink it by what the waiting money earns, and add them all up. We also add about ${Math.round((t.grossUp - 1) * 100)}% because selling investments triggers tax. The total is your target: `, num(inr(t.total)), `.`),
        analogy('A coupon that grows. If ₹100 turns into ₹120 while it waits, a ₹120 bill later only needs ₹100 put aside now. Do that for every year of the trip and add up the coupons.'),
        r0 ? example('one year, then another', say(`Take the first year of retirement, ${r0.year}. Costs are `, num(inrC(r0.spend)), r0.premiums + r0.events ? ` plus ${inrC(r0.premiums + r0.events)} of premiums and events` : '', r0.passive ? ` minus ${inrC(r0.passive)} of other income` : '', `. With the tax top-up (×${t.grossUp.toFixed(3)}) you must withdraw `, num(inrC(r0.gross)), `. It is the first year, so there is no waiting: worth `, num(inrC(r0.pv)), ` today.`),
          rk && rk !== r0 ? say(`Now take ${rk.year}, ${k} years later. It costs `, num(inrC(rk.gross)), ` in today's money. But your retirement money earns ${(t.rRet * 100).toFixed(1)}% a year above inflation while it waits, so we divide by ${real.toFixed(3)} ${k} times: `, num(inrC(rk.gross)), ` ÷ ${Math.pow(real, k).toFixed(3)} = `, num(inrC(rk.pv)), `. Repeat for all ${t.rows.length} years and add up: `, num(inr(t.total)), `.`) : '') : '',
        level === 2 ? table(['Year (age)', 'Costs', 'Premiums, events', 'Other income', 'Withdraw', 'Worth today'], tRows) : '')}
      ${story(3, 'Does a simple rule of thumb agree?',
        say(`A common shortcut is yearly spending divided by a safe withdrawal rate. At ${t.swr}% that is `, num(inr(t.classicAt)), `. `, t.total < t.classicAt ? `Our year-by-year number is lower because it lets the money run down to zero at ${mod.horizonAge} instead of leaving it untouched forever, so treat the rule of thumb as the cautious end.` : `Our year-by-year number is the more careful of the two.`),
        analogy('Sipping from a water tank. Sip slowly (3 to 3.5% a year) and it lasts the whole trip; gulp (5%+) and it runs dry early.'),
        level === 2 ? table(['Withdrawal rate', 'Corpus needed'], Object.entries(t.classic).map(([r, v]) => [`${r}%`, inr(v)])) : '')}
      ${story(4, 'What will you have by then?',
        say(`You hold `, num(inr(res.projection.potsTotal)), ` today. Each kind of investment grows at its own pace, and we take away inflation to stay in today's money. You also keep investing `, num(inrF(m.sipNow)), ` a month, and the plan follows your loans, baby, house and other events year by year, including any year your pay does not cover costs.`),
        analogy('Several fuel cans filling at different speeds, while a few small leaks (loans and events) drip out along the way.'),
        big ? example('one investment growing', say(`Your `, num(big.name), ` is worth `, num(inrC(big.v0)), ` today and is expected to grow ${(big.nomRet).toFixed(1)}% a year. After inflation that is ${(big.rr * 100).toFixed(1)}%. In ${yrsTo} years: `, num(inrC(big.v0)), ` × ${(1 + big.rr).toFixed(3)} multiplied ${yrsTo} times = `, num(inrC(fv)), ` in today's money, before adding any SIPs.`)) : '',
        sipH ? example('a monthly SIP', say(`A SIP of `, num(inrF(sipH.s.amount)), ` a month into ${sipH.x.name} is ${inrC(sipH.s.amount * 12)} a year. Each year's amount grows for the years it stays invested at ${(rr * 100).toFixed(1)}% above inflation, so over ${yrsTo} years it becomes roughly `, num(inrC(sipFv)), ` in today's money. (A simple flat-SIP estimate; the planner follows your exact dates and step-ups.)`)) : '',
        level === 2 ? h`${table(['Investment', 'Value now', 'Grows', 'After inflation'], potRows)}<div style="height:10px"></div>${table(['Year', 'Income', 'Costs + EMIs', 'Invested', 'Pots'], pRows)}` : '',
        say(`Added up at age ${m.retireAge}, you are on course for `, num(inr(g.projected)), `.`))}
      ${story(5, 'So where does that leave you?',
        say(`Target `, num(inr(g.target)), `, projected `, num(inr(g.projected)), `: `, h`<b class="${lvl}">${g.amount > 0 ? `a gap of ${inr(g.amount)}` : `${inr(-g.amount)} to spare`}</b>`, `.`), c ? say('Any one of these closes it on its own:') : '',
        c ? h`<ul class="fx-ul"><li>Invest about <b>${c.extraMonthly ? inrF(c.extraMonthly) : '—'}</b> more every month (money you would need to free up from spending or earn extra, since your free cash today is ${inrF(Math.max(0, m.freeCash))} a month).</li><li>Spend about <b>${c.lowerSpend ? inrF(c.lowerSpend) : '—'}</b> less every month once retired.</li><li>Retire later, at age <b>${c.laterAge ?? 'beyond 60'}</b>.</li></ul>` : '',
        c ? analogy('To fill a short tank you can add fuel, drive slower, or shorten the trip. Pick whichever is easiest for you.') : '')}
    </div></div>

    ${section('METHOD 2 · WHAT IF MARKETS ARE BUMPY?')}
    <div class="fx-card"><div class="col" style="gap:18px">
      ${story(1, 'Replaying your plan thousands of times',
        say(`Markets never give the same return every year. We replay your plan ${mc ? mc.paths.toLocaleString('en-IN') : '10,000'} times, each with its own random good and bad years, inflation and medical surprises, then count how often your money lasts until ${mod.horizonAge}.`),
        mc ? say('Result: ', num(`${Math.round(mc.success * 100)} out of 100`), ` futures last. You asked for at least `, num(`${A.successThreshold ?? 80}`), `. ${mc.success * 100 >= (A.successThreshold ?? 80) ? 'You clear that bar.' : 'You are below that bar, so a bad sequence of early years could break the plan.'}`) : h`<p class="fx-say">Not run yet. Open <a class="fx-link" href="#/fire/detail/mc">Monte Carlo</a> and tap Run.</p>`,
        analogy('Rolling dice for the weather on every day of the trip, then repeating the whole trip 10,000 times. If 8,000 trips arrive, the chance of success is 80%.'),
        example('reading the result', say(mc ? `Out of ${mc.paths.toLocaleString('en-IN')} trips, ${(mc.successes ?? Math.round(mc.success * mc.paths)).toLocaleString('en-IN')} arrived with money left, which is ${Math.round(mc.success * 100)}%.` : 'Once it has run, this line reads: "Out of 10,000 trips, N arrived with money left."')),
        level === 2 && mc ? table(['Detail', 'Value'], [['Futures simulated', mc.paths.toLocaleString('en-IN')], ['Random seed', String(mc.seed)], ['Survived', (mc.successes ?? Math.round(mc.success * mc.paths)).toLocaleString('en-IN')]]) : '')}
    </div></div>

    ${section('METHOD 3 · WHAT IF LIFE GOES DIFFERENTLY?')}
    <div class="fx-card"><div class="col" style="gap:14px">
      ${story(1, 'The same plan in different worlds',
        say('Each scenario changes a few things, for example a second income, lower returns or higher spending, and re-runs everything. This shows how sensitive your answer is.'),
        analogy('Choosing a different road to the same place: the highway, the scenic route, the mountain pass. Same destination, different fuel use.'),
        table(['Scenario', 'Earliest retirement', 'Gap'], sc.map((s) => [`${s.scenario.icon || ''} ${s.scenario.name}`, s.earliestAge ? `Age ${s.earliestAge}` : 'Not before 60', h`<span class="${s.gap > 0 ? 'bad' : 'ok'}">${s.gap > 0 ? inrC(s.gap) : `${inrC(-s.gap)} spare`}</span>`])), h`<a class="fx-link" href="#/fire/detail/scen" style="display:inline-block;margin-top:8px">Try your own what-if →</a>`)}
    </div></div>` : ''}

    <div class="fx-card"><div class="fx-lbl" style="margin-bottom:10px">WORDS EXPLAINED</div><div class="fx-chips">${[['present-value', 'Present value'], ['real-return', 'Real return'], ['inflation', 'Inflation'], ['swr', 'Withdrawal rate'], ['tax-grossup', 'Tax gross-up'], ['monte-carlo', 'Monte Carlo'], ['sip', 'SIP'], ['corpus', 'Corpus']].map(([id, l]) => h`<button class="fx-opt" data-term="${id}">${l}</button>`)}</div><a class="fx-link" href="#/fire/learn" style="display:inline-block;margin-top:12px">All terms and where the numbers come from →</a></div>
    <div class="fx-row"><button class="fx-btn ghost" data-act="csv" style="flex:1">Download as CSV</button><a class="fx-btn ghost" href="#/fire/how" style="flex:1;text-align:center">How the planner works</a></div>
    ${note('ⓘ', 'These are estimates from the assumptions you set. They are not financial, tax or legal advice.')}${fxNav('overview')}</div>`);
  bind(root, { click: {
    lvl: (el) => { level = Number(el.dataset.k); X.redraw(); },
    csv: () => { const L = ['Section,Year,Age,Costs,Premiums+Events,Other income,Withdrawal,Worth today', ...t.rows.map((r) => ['Target', r.year, r.age, r.spend, r.premiums + r.events, r.passive, r.gross, r.pv].map((v) => (typeof v === 'number' ? Math.round(v) : v)).join(',')), '', 'Section,Year,Age,Invested,Cash flow,Retirement corpus', ...res.projection.rows.map((r) => ['Projection', r.year, r.age, r.saving, r.net, r.corpus ?? ''].map((v) => (typeof v === 'number' ? Math.round(v) : v)).join(','))]; download(`fire-calculation-${X.today()}.csv`, L.join('\n'), 'text/csv'); toast('CSV downloaded'); },
  } });
  void tile;
}
