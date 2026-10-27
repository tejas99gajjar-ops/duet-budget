// Guided setup: Welcome → Pull from Duet → You & family → Owe & own → Goals → Review. Every step edits the real plan, so nothing is lost if you leave.
import { h, bind, IC, chip, statusChip, tile, note, head, toast, errToast } from './ui.js';
import { html } from '../core.js';
import * as FS from './store.js';
import * as X from './ctx.js';
import * as D from './duet.js';
import { GOAL_KINDS } from './defaults.js';
import { holdingValue, birthYearOf } from './engine.js';
import { inr, inrC, inrF, pc } from './format.js';
import { openApplyDuet } from './duetsync.js';
import { personSheet, childSheet, incomeSheet } from './inputs.js';
import { holdingSheet } from './inputs-assets.js';
import { loanSheet } from './inputs-fin.js';
import { editGoal } from './goals.js';

const STEPS = [['Welcome', 'Hi'], ['Duet', 'Pull from Duet'], ['Family', 'You & family'], ['Money', 'Owe & own'], ['Goals', 'Goals'], ['Review', 'Review']];
let step = 0;
const sum = (a) => a.reduce((s, x) => s + x, 0);

export async function wizard(root) {
  const plan = X.getPlan();
  if (!plan) return start(root);
  const res = X.run(), today = X.today(), p0 = plan.profile.people[0], base = res.meta.baseYear;
  const bar = h`<div class="fx-row" style="gap:6px" aria-label="Step ${step + 1} of ${STEPS.length}">${STEPS.map((_, i) => h`<i style="flex:1;height:5px;border-radius:3px;background:${i <= step ? 'var(--fx)' : 'var(--fx-line)'}"></i>`)}</div>`;
  const props = D.hasDuet() ? D.proposals(plan, today) : [], av = D.hasDuet() ? D.duetAverage(plan, today, 3) : null;
  const list = (items, empty) => items.length ? h`<div class="fx-list">${items}</div>` : h`<div class="fx-sub">${empty}</div>`;
  const people = plan.profile.people, kids = plan.profile.children || [];
  const body = [
    () => h`<div class="center" style="padding:18px 0 6px"><div style="font-size:64px">🔥</div><div class="fx-big" style="font-size:30px;margin:8px 0">Plan your financial freedom</div><div class="fx-sub" style="font-size:16px;line-height:1.5">A few quick steps to find out how much you need to retire, where you stand, and what to change. Everything is calculated in this app. Nothing leaves your household.</div></div>
      <div class="fx-card"><div class="col" style="gap:14px">${[['🔄', 'Pull what Duet already knows', 'Income, spending and balances'], ['👨‍👩‍👧', 'Tell us about your family', 'Ages, retirement age, children'], ['🏦', 'Add what you own and owe', 'Investments, SIPs, loans'], ['🎯', 'Set your goals', 'Retirement plus anything else']].map(([i, t, s]) => h`<div class="fx-row" style="gap:14px"><span class="fx-ico lg" style="background:var(--fx-tile)">${i}</span><span><b>${t}</b><div class="fx-sub">${s}</div></span></div>`)}</div></div>
      ${note('⏱️', 'About five minutes. You can skip anything and fill it in later from Inputs.', 'purple')}`,
    () => h`<div><div class="fx-sub">${av && av.months ? `Averages of your last ${av.months} full month${av.months === 1 ? '' : 's'} of entries.` : 'Duet has no entries to average yet.'}</div></div>
      ${av && (av.income || av.expense) ? h`<div class="fx-grid2">${tile('INCOME / MO', inrC(av.income))}${tile('SPENDING / MO', inrC(av.expense))}</div>` : ''}
      ${props.length ? h`<div class="fx-card"><b>${props.length} thing${props.length > 1 ? 's' : ''} the planner can fill in</b><div class="fx-sub" style="margin:6px 0 12px">${props.slice(0, 4).map((p) => p.label).join(', ')}${props.length > 4 ? '…' : ''}</div><button class="fx-btn" data-act="duet">Review and apply</button></div>` : note('✅', D.hasDuet() ? 'Nothing more to pull from Duet right now. You can add the rest by hand in the next steps.' : 'Duet data is not available, so continue and enter things by hand.')}
      <div class="fx-card"><div class="fx-row fx-between"><b>Income</b><button class="fx-link" data-act="inc">Add</button></div>${list(plan.incomes.map((i) => h`<div class="fx-li"><span class="grow">${i.label}</span><b>${inrC(i.takeHome)}/mo</b></div>`), 'No income yet.')}</div>`,
    () => h`<div><div class="fx-sub">Ages and retirement age drive the whole plan.</div></div>
      <div class="fx-card"><div class="fx-lbl" style="margin-bottom:8px">PEOPLE</div>${list(people.map((p, i) => h`<button class="fx-li" data-act="pp" data-i="${i}"><span class="avatar" style="width:40px;height:40px;border:0;background:${i ? '#E879A0' : 'var(--fx)'}">${(p.name || '?')[0]}</span><span class="grow"><b>${p.name}</b><div class="fx-sub">Age ${base - birthYearOf(p, base)} · retire at ${p.retireAge ?? 50}</div></span>${IC.chev}</button>`), '')}${people.length < 2 ? h`<button class="fx-add" data-act="pp" data-i="-1" style="margin-top:10px;padding:14px">${IC.plus}<span>Add your partner</span></button>` : ''}</div>
      <div class="fx-card"><div class="fx-lbl" style="margin-bottom:8px">CHILDREN</div>${list(kids.map((k) => h`<button class="fx-li" data-act="kk" data-id="${k.id}"><span class="grow"><b>${k.name}</b><div class="fx-sub">${k.planned ? 'Planned' : 'Born'} ${k.birthYear}</div></span>${IC.chev}</button>`), 'No children added.')}<button class="fx-add" data-act="kk" style="margin-top:10px;padding:14px">${IC.plus}<span>Add a child</span></button></div>`,
    () => h`<div><div class="fx-sub">Add your main investments and loans. You can refine them later.</div></div>
      <div class="fx-card"><div class="fx-row fx-between"><b>Investments</b><b class="pur">${inrC(sum(plan.holdings.map(holdingValue)))}</b></div>${list(plan.holdings.map((x) => h`<button class="fx-li" data-act="hh" data-id="${x.id}"><span class="grow">${x.name}</span><b>${inrC(holdingValue(x))}</b></button>`), 'Nothing added yet.')}<button class="fx-add" data-act="hh" style="margin-top:10px;padding:14px">${IC.plus}<span>Add investment</span></button></div>
      <div class="fx-card"><div class="fx-row fx-between"><b>Loans</b><b class="bad">${inrC(sum(plan.loans.filter((l) => l.status !== 'closed').map((l) => Number(l.outstanding ?? l.principal) || 0)))}</b></div>${list(plan.loans.map((l) => h`<button class="fx-li" data-act="ll" data-id="${l.id}"><span class="grow">${l.name}</span><b>${inrC(l.outstanding ?? l.principal)}</b></button>`), 'No loans. Lucky you.')}<button class="fx-add" data-act="ll" style="margin-top:10px;padding:14px">${IC.plus}<span>Add loan</span></button></div>`,
    () => h`<div><div class="fx-sub">Retirement is always there. Add anything else you are saving for.</div></div>
      <div class="fx-card">${list(plan.goals.filter((g) => !g.archived).map((g) => h`<button class="fx-li" data-act="gg" data-id="${g.id}"><span class="fx-ico" style="background:${g.color || '#7C5FE6'}22">${g.icon || GOAL_KINDS[g.kind]?.icon || '🎯'}</span><span class="grow"><b>${g.name}</b><div class="fx-sub">${g.kind === 'retirement' ? `Retire at ${res.meta.retireAge}` : g.target ? `${inrC(g.target)}${g.date ? ` by ${g.date.slice(0, 4)}` : ''}` : GOAL_KINDS[g.kind]?.label}</div></span>${IC.chev}</button>`), '')}<button class="fx-add" data-act="gg" style="margin-top:10px;padding:14px">${IC.plus}<span>Add a goal</span></button></div>`,
    () => h`<div class="center" style="padding:8px 0"><div style="font-size:52px">🎉</div><div class="fx-title" style="font-size:26px;margin-top:6px">You're all set</div></div>
      <div class="fx-card"><div class="fx-row fx-between"><span class="fx-lbl">YOUR FIRE NUMBER</span>${statusChip(res.gap.status)}</div><div class="fx-big" style="font-size:clamp(30px,10vw,42px);margin:6px 0">${inr(res.gap.target)}</div><div class="fx-sub">Needed at ${res.meta.retireAge} (${res.meta.retireYear}), in today's rupees</div>
        <div class="fx-grid2" style="margin-top:12px">${tile('PROJECTED', inrC(res.gap.projected), pc(res.gap.pct) + ' funded')}${tile(res.gap.amount > 0 ? 'GAP' : 'SURPLUS', inrC(Math.abs(res.gap.amount)))}</div></div>
      ${note('ⓘ', 'These are estimates from your inputs. Open Inputs any time to refine them, and the plan updates instantly.', 'purple')}`,
  ];
  const last = step === STEPS.length - 1;
  html(root, h`<div class="fx">${head({ kicker: `STEP ${step + 1} OF ${STEPS.length}`, title: STEPS[step][0] === 'Welcome' ? 'FIRE Planner' : STEPS[step][1], back: step ? null : '#/fire' })}${bar}
    ${body[step]()}<div class="fx-sticky fx-row" style="gap:10px">${step ? h`<button class="fx-btn ghost" data-act="prev" style="flex:1">Back</button>` : h`<button class="fx-btn ghost" data-act="skip" style="flex:1">Skip setup</button>`}<button class="fx-btn" data-act="${last ? 'fin' : 'next'}" style="flex:2">${last ? 'Open my plan' : step === 0 ? 'Get started' : 'Continue'}</button></div></div>`);
  bind(root, { click: {
    next: () => { step++; X.redraw(); scrollTo(0, 0); }, prev: () => { step--; X.redraw(); scrollTo(0, 0); },
    skip: () => finish(), fin: () => finish(),
    duet: () => openApplyDuet(), inc: () => incomeSheet(),
    pp: (el) => personSheet(Number(el.dataset.i)), kk: (el) => childSheet(el.dataset.id), hh: (el) => holdingSheet(el.dataset.id), ll: (el) => loanSheet(el.dataset.id), gg: (el) => editGoal(el.dataset.id),
  } });
  void chip; void inrF; void errToast;
}

function finish() { FS.edit('settings', (s) => { s.wizardDone = true; return s; }, { immediate: true, noUndo: true }); step = 0; location.hash = '#/fire'; }

// No plan yet: show a welcome and create the empty plan (Duet numbers are pulled in on the next step).
function start(root) {
  html(root, h`<div class="fx"><div class="center" style="padding:40px 8px 10px"><div style="font-size:72px">🔥</div><div class="fx-big" style="font-size:30px;margin:10px 0">Plan your financial freedom</div><div class="fx-sub" style="font-size:16px;line-height:1.5">Find out how much you need to retire, where you stand today, and what would close the gap. Calculated right here, free, with nothing sent anywhere.</div></div>
    <div class="fx-card"><div class="col" style="gap:14px">${[['🧮', 'Three methods', 'Exact projection, Monte Carlo and scenarios'], ['🔗', 'Uses your Duet data', 'Income, spending and balances stay in sync'], ['🔒', 'Private to your household', 'Only people in this Duet household see it']].map(([i, t, s]) => h`<div class="fx-row" style="gap:14px"><span class="fx-ico lg" style="background:var(--fx-tile)">${i}</span><span><b>${t}</b><div class="fx-sub">${s}</div></span></div>`)}</div></div>
    <div class="fx-sticky"><button class="fx-btn" data-act="go">Get started</button><a href="#/dashboard" class="fx-sub center" style="display:block;margin-top:12px">Not now</a></div></div>`);
  bind(root, { click: { go: async (el) => { el.disabled = true; try { await FS.createPlan(null, 'My FIRE Plan'); step = 1; X.redraw(); } catch (e) { el.disabled = false; errToast(e); } } } });
}
