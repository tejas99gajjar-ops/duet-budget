// "New here?" support for the FIRE planner: plain-language names, a Start-here path, and optional helpers on every screen.
// Everything here is opt-in: the helpers only appear after someone taps "New here?" (and can be switched off again there).
// It only adds things around the existing screens; it never changes what a screen calculates or stores.
import { h, sheet } from '../core.js';
import * as X from './ctx.js';
import { inr, inrC } from './format.js';
import { sectionHealth } from './health.js';
import * as FS from './store.js';
import { examplePlan } from './example.js';

const KEY = 'duet.fire.help', STEPS_KEY = 'duet.fire.steps';
const rd = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const wr = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };
export const helpOn = () => rd(KEY, false) === true;
export const setHelp = (v) => wr(KEY, !!v);

// Plain name first, the original name kept beside it.
export const PLAIN = { '': ['My answer', 'Overview'], detail: ['Check my math', 'Detail'], goals: ["What I'm saving for", 'Goals'], inputs: ['My facts', 'Inputs'], live: ['Real life vs plan', 'Live'], checkin: ['Progress', 'Check-in'] };

// Where each screen sits in the walk-through, and what to read next.
export const FLOW = [
  ['', 'My answer', '#/fire'], ['detail/target', 'Check my math: Target', '#/fire/detail/target'], ['detail/projection', 'Check my math: Projection', '#/fire/detail/projection'],
  ['detail/gap', 'Check my math: Gap', '#/fire/detail/gap'], ['detail/montecarlo', 'Check my math: Stress test', '#/fire/detail/montecarlo'], ['detail/scenarios', 'Check my math: What-if worlds', '#/fire/detail/scenarios'],
  ['goals', "What I'm saving for", '#/fire/goals'], ['inputs', 'My facts', '#/fire/inputs'], ['live', 'Real life vs plan', '#/fire/live'], ['checkin', 'Progress', '#/fire/checkin'],
];

const HELP = {
  '': { what: 'Your answer in one picture: how much money you need on the day you stop working, how much you are on course to have, and whether that is enough.', read: 'The ring shows how much of the goal is covered. Green means covered, amber is close, red means you are short. "You need" is the target; "On course for" is where your plan lands.', next: 'Try the sliders under "Try it" to see what retiring earlier or later, or saving more, would do. Everything on this page recalculates instantly and nothing is saved by playing.' },
  'detail/target': { what: 'The size of the pot you need on retirement day, and how that number is worked out.', read: 'It is your yearly spending in retirement (in today\'s money, grown by inflation) divided by a safe withdrawal rate. A lower withdrawal rate means a bigger pot, and a safer plan.', next: 'Open "Show detailed calculation" if you want every step. Then look at the Projection tab to see whether your savings reach this number.' },
  'detail/projection': { what: 'A straight-line forecast: what your savings and investments grow to, year by year, if returns come out as assumed.', read: 'The line is your total money over time. Where it crosses the target is when you could stop. Steps down are big spends (loans, goals); steps up are windfalls.', next: 'If the line stays below the target, open the Gap tab to see exactly how much more is needed and what could close it.' },
  'detail/gap': { what: 'The shortfall (or surplus) between what you need and what you will have, and ways to close it.', read: 'The roadmap shows, for each start year, how much extra to invest each month. The earlier you start, the smaller it is. Each scenario column shows a different future (hopeful, expected, cautious).', next: 'Pick the scenario you feel most comfortable with and note its monthly amount. You can also see the same gap closed by spending less.' },
  'detail/montecarlo': { what: 'A stress test: thousands of random possible futures, some kind and some harsh, to see how often your money lasts.', read: 'The percentage is the share of futures where you did not run out. 80% or more is usually seen as comfortable. The spread shows the good and bad cases.', next: 'If the number is low, go back to the Gap tab, or try retiring a little later, then run the stress test again.' },
  'detail/scenarios': { what: 'Your plan in different "what-if worlds": better markets, expected markets, worse markets, or your own.', read: 'Each card is a full plan under one set of assumptions. Compare them to see how sensitive your plan is to returns and inflation.', next: 'If the worse worlds still look fine, you have a robust plan. If not, build more margin in Goals or Inputs.' },
  'detail/calc': { what: 'Every step of the calculation in plain words, using your own numbers.', read: 'Read from top to bottom: each line shows the inputs and the result for that step.', next: 'Nothing to change here. If a number looks wrong, fix the source in My facts (Inputs).' },
  goals: { what: 'Things you are saving for, such as retirement, a house or school fees.', read: 'Retirement is always first. Each goal shows how much is set aside and whether it is on track.', next: 'Add a goal with the button at the top. Then check My answer to see how it changes the picture.' },
  inputs: { what: 'The facts the planner works from: your ages, income, spending, savings, loans, insurance, life events and assumptions.', read: 'Each row is one topic. A green dot means complete, amber means it needs a look. Tap a row to edit it.', next: 'Fill the amber rows first. The planner recalculates the moment you change anything.' },
  live: { what: 'Your real income, spending and investing from the budget side of the app, compared with what your plan assumes.', read: 'If real life differs from the plan (you save less than assumed, for example), the gap will show here.', next: 'If a figure differs a lot, update the plan in My facts so the planner uses what is really happening.' },
  checkin: { what: 'A dated snapshot of your plan, so you can see over time whether you are getting closer to your goal.', read: 'Each snapshot records the answer on that day. The chart compares them.', next: 'Save a check-in every few months, or after a big change, and compare.' },
};
export const helpFor = (key) => HELP[key] || null;

export const screenKey = (parts) => { const [a = '', b, c] = parts; if (a === 'detail') return `detail/${b || 'target'}`; return ['goals', 'inputs', 'live', 'checkin'].includes(a) && !b ? a : a === '' ? '' : null; };

// ---- the Start-here path ----
const PATH = [
  ['Tell it about you', 'Your age, income, spending and savings. Takes a few minutes.', '#/fire/inputs', 'facts'],
  ['See what you will need', 'The size of the pot that lets you stop working.', '#/fire/detail/target', 'need'],
  ['Check if you are on track', 'Your answer, with a simple ring and a one-line verdict.', '#/fire', 'track'],
  ['Try changes', 'Slide retirement age or monthly saving and watch the answer move.', '#/fire/detail/gap', 'try'],
  ['Watch real life', 'Compare your plan with what you really earn and spend.', '#/fire/live', 'live'],
];
const stepsDone = () => rd(STEPS_KEY, {});

export function startExample() { FS.enterExample(examplePlan()); location.hash = '#/fire'; X.redraw(); }
export function leaveExample() { const had = FS.hasRealPlan(); FS.exitExample(); if (had) { location.hash = '#/fire'; X.redraw(); } else location.hash = '#/fire/wizard'; }

export function openGuide() {
  const done = stepsDone(), on = helpOn();
  const sh = sheet(h`<div class="row between"><h1 style="font-size:20px">New here? Start here</h1><button class="iconbtn" data-act="close" aria-label="Close">✕</button></div>
    <p class="muted" style="font-size:14px;line-height:1.5">This planner answers one question: <b>if you stop working at the age you choose, will your money last?</b> Nothing here changes your real money. It is a calculator you can play with.</p>
    <div class="col" style="gap:8px">${PATH.map(([t, s, href, k], i) => h`<a class="menu-row" href="${href}" data-act="close" data-step="${k}"><span class="menu-ico ${done[k] ? 'tick' : ''}">${done[k] ? '✓' : String(i + 1)}</span><span class="grow"><b>${t}</b><div class="small muted">${s}</div></span><span class="muted">›</span></a>`)}</div>
    <div class="menu-row" style="justify-content:space-between"><span class="grow"><b>Show helpers on every screen</b><div class="small muted">"What am I looking at?" and "Next" buttons</div></span><button type="button" class="switch ${on ? 'on' : ''}" data-act="help" role="switch" aria-checked="${on}" aria-label="Show helpers"></button></div>
    <button class="btn ghost" data-act="example">${FS.fs.example ? 'Leave the example plan' : 'Explore an example plan first'}</button>
    <a class="btn ghost" href="#/fire/learn" data-act="close" style="text-align:center">Open the full guide and glossary</a>`,
  { click: { help: (el) => { const v = !helpOn(); setHelp(v); el.classList.toggle('on', v); el.setAttribute('aria-checked', String(v)); X.redraw(); }, example: () => { sh.close(); FS.fs.example ? leaveExample() : startExample(); } } });
  if (!on) { setHelp(true); const sw = sh.el.querySelector('.switch'); sw?.classList.add('on'); sw?.setAttribute('aria-checked', 'true'); X.redraw(); }   // tapping "New here?" turns the helpers on
  return sh;
}

export function openHelp(key) {
  const t = helpFor(key); if (!t) return;
  const nxt = (() => { const i = FLOW.findIndex((f) => f[0] === key); return i >= 0 && FLOW[i + 1] ? FLOW[i + 1] : null; })();
  sheet(h`<div class="row between"><h1 style="font-size:20px">What am I looking at?</h1><button class="iconbtn" data-act="close" aria-label="Close">✕</button></div>
    <div class="col" style="gap:12px"><div class="menu-row"><span class="menu-ico">👀</span><span class="grow"><b>What this shows</b><div class="small" style="line-height:1.5;margin-top:2px">${t.what}</div></span></div>
      <div class="menu-row"><span class="menu-ico">📖</span><span class="grow"><b>How to read it</b><div class="small" style="line-height:1.5;margin-top:2px">${t.read}</div></span></div>
      <div class="menu-row"><span class="menu-ico">👉</span><span class="grow"><b>What to do next</b><div class="small" style="line-height:1.5;margin-top:2px">${t.next}</div></span></div></div>
    ${nxt ? h`<a class="btn" href="${nxt[2]}" data-act="close">Next: ${nxt[1]} →</a>` : ''}<button class="btn ghost" data-act="close">Close</button>`);
}

/** Called after every planner screen is drawn: plain names always; helpers only when switched on. */
export function decorate(box, parts) {
  if (!box) return;
  const [a = ''] = parts, nm = PLAIN[a], kick = box.querySelector('.fx-kick');
  if (nm && kick && /^(FIRE PLANNER|FIRE DETAIL)$/.test(kick.textContent.trim())) kick.textContent = `${nm[0]} · ${nm[1]}`.toUpperCase();
  if (FS.fs.example && !box.querySelector('.fx-exbar')) box.insertAdjacentHTML('afterbegin', `<div class="fx-exbar"><span>📘</span><span class="grow"><b>Example plan</b> · read-only, nothing is saved</span><button type="button" data-excit>${FS.hasRealPlan() ? 'Back to my plan' : 'Make my own plan'}</button></div>`);
  const headEl = box.querySelector('.fx-head');
  const on = helpOn(), key = screenKey(parts);
  if (!headEl || box.querySelector('.fx-helpbar,.fx-newbar')) return;
  if (a === '' && !on) { headEl.insertAdjacentHTML('afterend', '<button type="button" class="fx-newbar" data-newhere><span>🧭</span><span class="grow"><b>New here?</b> Start with a 1-minute guide</span><span>›</span></button>'); return; }
  if (on && a === '') helpCards(box);
  if (on && key != null && helpFor(key)) {
    headEl.insertAdjacentHTML('afterend', `<div class="fx-helpbar"><button type="button" data-help="${key}">👀 What am I looking at?</button><button type="button" data-newhere>${a === '' ? 'Guide ✓' : 'Guide'}</button></div>`);
    const i = FLOW.findIndex((f) => f[0] === key), nxt = FLOW[i + 1];
    box.insertAdjacentHTML('beforeend', `<div class="fx-nextcard">${i > 0 ? '<a class="fx-btn ghost" href="#/fire">↑ Back to my answer</a>' : ''}${nxt ? `<a class="fx-btn" href="${nxt[2]}">Next: ${nxt[1]} →</a>` : ''}</div>`);
  }
}

let wired = false;
export function wireGuide() {
  if (wired) return; wired = true;
  document.addEventListener('click', (e) => {
    if (!document.querySelector('.fx') && !e.target.closest('.overlay')) return;
    const st = e.target.closest?.('[data-step]'); if (st) { const d = stepsDone(); d[st.dataset.step] = 1; wr(STEPS_KEY, d); }
    const ex = e.target.closest?.('[data-excit]'); if (ex) { e.preventDefault(); leaveExample(); return; }
    const g = e.target.closest?.('[data-newhere]'); if (g) { e.preventDefault(); openGuide(); return; }
    const hp = e.target.closest?.('[data-help]'); if (hp) { e.preventDefault(); openHelp(hp.dataset.help); }
  });
}

// ---- extra pictures and plain-language lines on My answer (only while helpers are on) ----
const esc = (x) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const yearOf = (d) => Number(String(d).slice(0, 4));

/** "Your retirement in one picture": a road from today to the planning age, with the day you stop working marked. */
function lifeRoad(res, plan) {
  const m = res.meta, a0 = m.ageNow, a1 = m.retireAge, a2 = m.horizonAge, span = Math.max(1, a2 - a0), W = 320;
  const x = (age) => 8 + ((Math.max(a0, Math.min(a2, age)) - a0) / span) * (W - 16);
  const ro = res.gap.runsOutAge && res.gap.runsOutAge < a2 ? res.gap.runsOutAge : null;
  const marks = [...res.goals.filter((g) => g.date && g.kind !== 'retirement').map((g) => ({ age: yearOf(g.date) - m.birth, t: g.name, i: '🎯' })),
    ...(plan.events || []).filter((e) => e.enabled !== false && e.date).map((e) => ({ age: yearOf(e.date) - m.birth, t: e.name || e.kind, i: '📌' }))]
    .filter((k) => k.age > a0 && k.age < a2).sort((p, q) => p.age - q.age).slice(0, 5);
  const earn = Math.max(0, a1 - a0), live = Math.max(0, (ro || a2) - a1);
  const svg = `<svg viewBox="0 0 ${W} 84" role="img" aria-label="From age ${a0} to ${a2}: you earn and save until ${a1}, then live on your pot" style="width:100%;height:auto">
    <rect x="${x(a0)}" y="34" width="${Math.max(0, x(a1) - x(a0))}" height="16" rx="8" fill="var(--accent)"/>
    <rect x="${x(a1)}" y="34" width="${Math.max(0, x(ro || a2) - x(a1))}" height="16" rx="8" fill="var(--fx)"/>
    ${ro ? `<rect x="${x(ro)}" y="34" width="${Math.max(0, x(a2) - x(ro))}" height="16" rx="8" fill="var(--red)" opacity=".75"/>` : ''}
    ${marks.map((k) => `<circle cx="${x(k.age)}" cy="42" r="5" fill="var(--card)" stroke="var(--text)" stroke-width="1.5"/>`).join('')}
    <text x="${x(a0)}" y="26" font-size="10" fill="var(--muted)" text-anchor="start">Today</text>
    <text x="${x(a1)}" y="26" font-size="10" fill="var(--text)" font-weight="700" text-anchor="middle">Stop working</text>
    <text x="${x(a2)}" y="26" font-size="10" fill="var(--muted)" text-anchor="end">Plan to ${a2}</text>
    <text x="${x(a0)}" y="68" font-size="11" fill="var(--text)" text-anchor="start">${a0}</text>
    <text x="${x(a1)}" y="68" font-size="11" fill="var(--text)" font-weight="700" text-anchor="middle">${a1}</text>
    <text x="${x(a2)}" y="68" font-size="11" fill="var(--text)" text-anchor="end">${a2}</text></svg>`;
  return `<section class="fx-card fx-road"><h3>Your retirement in one picture</h3>${svg}
    <div class="fx-road-key"><span><i style="background:var(--accent)"></i>Earning and saving · ${earn} yrs</span><span><i style="background:var(--fx)"></i>Living on your pot · ${live} yrs</span>${ro ? `<span><i style="background:var(--red)"></i>Money runs out at ${ro}</span>` : ''}</div>
    ${marks.length ? `<div class="fx-road-marks">${marks.map((k) => `<span>${k.i} ${esc(k.t)} · age ${k.age}</span>`).join('')}</div>` : ''}
    <p class="fx-sub" style="margin-top:8px">${ro ? `On this plan the money runs out around age ${ro}. The Gap tab shows how to fix that.` : `On this plan the money lasts past ${a2}.`}</p></section>`;
}

/** One suggested next step, chosen from the person's own numbers. */
function doNext(res, plan) {
  const hl = Object.values(sectionHealth(plan, X.today())).filter((s) => s && s.status), need = hl.filter((s) => s.status !== 'ok').length;
  if (need) return { icon: '📝', t: `Finish your facts: ${need} ${need === 1 ? 'section needs' : 'sections need'} a look`, s: 'The answer is only as good as what goes in.', href: '#/fire/inputs', go: 'Open My facts' };
  const g = res.gap;
  if (g.amount > 0) { const c = X.close(); return { icon: '🎯', t: `You are ${inr(g.amount)} short`, s: c?.extraMonthly ? `Investing ${inr(c.extraMonthly)} more a month closes it. Try it with the slider below.` : 'See the ways to close the gap.', href: '#/fire/detail/gap', go: 'See ways to close the gap' }; }
  return { icon: '✅', t: 'You are on track. Test how safe the plan is', s: 'A stress test runs thousands of possible futures and shows how often your money lasts.', href: '#/fire/detail/montecarlo', go: 'Run the stress test' };
}

/** A few plain sentences about the person's own numbers. */
function everyday(res) {
  const m = res.meta, t = res.target, g = res.gap, spendYear = (m.spendNow || 0) * 12;
  const rows = [['🏁', `You plan to stop working at <b>${m.retireAge}</b>, in <b>${Math.round(m.yearsToRet)} years</b>.`],
    ['🏠', `In retirement you would spend about <b>${inr(t.monthlyToday)} a month</b> in today's money.`]];
  if (spendYear > 0) rows.push(['🧮', `The pot you need (<b>${inr(t.total)}</b>) is about <b>${Math.round(t.total / spendYear)} years</b> of what you spend today.`]);
  if (m.savingsRate != null) rows.push(['💰', `You save about <b>${Math.round(Math.max(0, m.savingsRate) * 100)}%</b> of your take-home pay.`]);
  if (m.nominalFactor > 1) rows.push(['📉', `Prices rise about <b>${Math.round((m.infl || 0) * 100)}%</b> a year, so ₹1 lakh at retirement buys only what <b>${inr(100000 / m.nominalFactor)}</b> buys today.`]);
  rows.push([g.runsOutAge && g.runsOutAge < m.horizonAge ? '⚠️' : '🛟', g.runsOutAge && g.runsOutAge < m.horizonAge ? `Your money would run out around age <b>${g.runsOutAge}</b>.` : `Your money lasts past age <b>${m.horizonAge}</b> on this plan.`]);
  return rows;
}

export function helpCards(box) {
  const hero = box.querySelector('.fx-hero2'); if (!hero || box.querySelector('.fx-helpcards')) return;
  let res, plan; try { plan = X.getPlan(); res = X.run(); } catch { return; }
  if (!plan || !res) return;
  const nx = doNext(res, plan), rows = everyday(res);
  hero.insertAdjacentHTML('afterend', `<div class="fx-helpcards col" style="gap:14px">
    <section class="fx-card fx-next"><div class="fx-next-i">${nx.icon}</div><div class="grow"><div class="eyebrow">Do this next</div><b>${esc(nx.t)}</b><div class="fx-sub">${esc(nx.s)}</div></div></section>
    <a class="fx-btn" href="${nx.href}" style="margin-top:-6px">${esc(nx.go)} →</a>
    ${lifeRoad(res, plan)}
    <section class="fx-card"><h3>In everyday terms</h3><div class="col" style="gap:10px;margin-top:10px">${rows.map(([i, t]) => `<div class="fx-eday"><span>${i}</span><span>${t}</span></div>`).join('')}</div></section></div>`);
}
