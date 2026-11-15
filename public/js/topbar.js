// One sticky top bar for the whole app (replaces the old Budget | FIRE switcher and FIRE's own bottom bar).
//   Money tab  -> Transactions | Budgets | Wallets
//   Plan tab   -> Overview | Detail | Goals | Inputs | Live | Check-in | Guide
// Everything else shows no bar. The avatar always opens the account menu (Settings, Profile, Recurring, Activity, theme...).
import { h, sheet, space, avatar } from './core.js';

const K = 'duet.money';
const remember = (v) => { try { sessionStorage.setItem(K, v); } catch { /* private mode */ } };
const recall = () => { try { return sessionStorage.getItem(K) || 'budgets'; } catch { return 'budgets'; } };

export const MONEY = [['transactions', 'Transactions', '#/transactions'], ['budgets', 'Budgets', '#/budgets'], ['wallets', 'Wallets', '#/wallets']];
export const moneyHome = () => '#/' + recall();
export const PLAN = [['overview', 'Overview', '#/fire'], ['detail', 'Detail', '#/fire/detail/target'], ['goals', 'Goals', '#/fire/goals'], ['inputs', 'Inputs', '#/fire/inputs'], ['live', 'Live', '#/fire/live'], ['checkin', 'Check-in', '#/fire/checkin'], ['learn', 'Guide', '#/fire/learn']];
const PLAN_OF = { '': 'overview', detail: 'detail', goals: 'goals', goal: 'goals', inputs: 'inputs', prices: 'inputs', live: 'live', checkin: 'checkin', learn: 'learn', how: 'learn', settings: 'overview', wizard: 'overview' };

const avatarBtn = (space0) => {
  const m = space0?.members || [];
  return h`<button class="tb-av" data-menu aria-label="Account and settings"><span class="avatars">${m.slice(0, 2).map(avatar)}</span></button>`;
};

/** Draw the bar for the current route. `kind` comes from the route table: 'money' | 'plan' | undefined. */
export function renderTopbar(el, kind, path) {
  if (!el) return;
  if (!kind) { el.hidden = true; el.innerHTML = ''; return; }
  let sp = null; try { sp = space(); } catch { /* not loaded yet */ }
  let items, active, label;
  if (kind === 'money') { active = path.split('/')[0]; remember(active); items = MONEY; label = 'Money'; }
  else { const part = path.split('/')[1] || ''; active = PLAN_OF[part] || 'overview'; items = PLAN; label = 'Plan'; }
  el.hidden = false; el.dataset.kind = kind;
  el.innerHTML = h`<div class="tb"><div class="tb-seg" role="tablist" aria-label="${label}">${items.map(([id, name, href]) => h`<a role="tab" href="${href}" class="${id === active ? 'on' : ''}" aria-selected="${id === active}">${name}</a>`)}</div>${avatarBtn(sp)}</div>`.s;
  el.querySelector('.tb-seg a.on')?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
}

const L = (href, ico, name, sub) => h`<a class="menu-row" href="${href}" data-act="close"><span class="menu-ico">${ico}</span><span class="grow"><b>${name}</b><div class="small muted">${sub}</div></span><span class="muted">›</span></a>`;
/** The account menu: everything that lives outside the five tabs. */
export function openMenu() {
  const sp = space();
  sheet(h`<div class="row" style="gap:12px"><div class="avatars">${(sp.members || []).map(avatar)}</div>
      <div class="grow"><b>${sp.name}</b><div class="small muted">${(sp.members || []).map((x) => x.name).join(' & ')}</div></div></div>
    <div class="col" style="gap:4px">
      ${L('#/settings', '⚙️', 'Settings', 'Space, members, currency, backup, sign out')}
      ${L('#/profile', '👤', 'Profile', 'Your name, colour and preferences')}
      ${L('#/recurring', '🔁', 'Recurring', 'Bills and income that repeat')}
      ${L('#/pace', '⏱️', 'Spending pace', 'Are you on track this month?')}
      ${L('#/activity', '🕑', 'Activity', 'Who changed what, and when')}
      ${L('#/portfolio', '📈', 'Portfolio', 'Investments across wallets')}
      ${L('#/fire/settings', '🔥', 'Plan settings', 'Rename, back up or import your plan')}
    </div>
    <button class="btn ghost" data-theme-toggle>Switch light / dark</button>`, {});
}

// ---- swipe order: the pages a left/right swipe moves between (see gestures.js) ----
const DETAIL = ['target', 'projection', 'gap', 'montecarlo', 'scenarios', 'calc'];
const PLAN_FLOW = ['#/fire', ...DETAIL.map((d) => `#/fire/detail/${d}`), '#/fire/goals', '#/fire/inputs', '#/fire/live', '#/fire/checkin', '#/fire/learn'];
const MONEY_FLOW = MONEY.map((m) => m[2]);
/** For a route path like "budgets" or "fire/detail/gap": { prev, next } hashes, or null when swiping should do nothing here. */
export function swipeNeighbors(path) {
  const [a, b, c] = path.split('/');
  let flow, key;
  if (MONEY.some((m) => m[0] === a) && !b) { flow = MONEY_FLOW; key = '#/' + a; }
  else if (a === 'fire') {
    flow = PLAN_FLOW;
    if (!b) key = '#/fire';
    else if (b === 'detail') key = `#/fire/detail/${c || 'target'}`;
    else if (['goals', 'inputs', 'live', 'checkin', 'learn'].includes(b) && !c) key = '#/fire/' + b;
  }
  const i = flow && key ? flow.indexOf(key) : -1; if (i < 0) return null;
  return { prev: flow[i - 1] || null, next: flow[i + 1] || null };
}
