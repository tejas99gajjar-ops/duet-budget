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
export const PLAN = [['overview', 'My answer', '#/fire'], ['detail', 'Check my math', '#/fire/detail/target'], ['goals', 'Saving for', '#/fire/goals'], ['inputs', 'My facts', '#/fire/inputs'], ['live', 'Real vs plan', '#/fire/live'], ['checkin', 'Progress', '#/fire/checkin'], ['learn', 'Guide', '#/fire/learn']];   // plain names; each screen's heading keeps the original (Overview, Detail, Goals, Inputs, Live, Check-in)
const PLAN_OF = { '': 'overview', detail: 'detail', goals: 'goals', goal: 'goals', inputs: 'inputs', prices: 'inputs', live: 'live', checkin: 'checkin', learn: 'learn', how: 'learn', settings: 'overview', wizard: 'overview' };

const avatarBtn = (space0) => {
  const m = space0?.members || [];
  return h`<button class="tb-av" data-menu aria-label="Account and settings"><span class="avatars">${m.slice(0, 2).map(avatar)}</span></button>`;
};

/** Draw the bar for the current route. `kind` comes from the route table: 'money' | 'plan' | undefined.
 *  The bar is kept between pages of the same kind, and one highlight slides to the new tab (also while a finger drags it, see gestures.js). */
export function renderTopbar(el, kind, path) {
  if (!el) return;
  if (!kind) { el.hidden = true; el.innerHTML = ''; return; }
  let sp = null; try { sp = space(); } catch { /* not loaded yet */ }
  let items, active, label;
  if (kind === 'money') { active = path.split('/')[0]; remember(active); items = MONEY; label = 'Money'; }
  else { const part = path.split('/')[1] || ''; active = PLAN_OF[part] || 'overview'; items = PLAN; label = 'Plan'; }
  el.hidden = false;
  const seg = el.querySelector('.tb-seg');
  if (seg && el.dataset.kind === kind && seg.children.length === items.length + 1) {            // same bar: just move the highlight
    seg.querySelectorAll('a').forEach((a, i) => { const on = items[i][0] === active; a.classList.toggle('on', on); a.setAttribute('aria-selected', String(on)); });
    settleIndicator(el, true); return;
  }
  el.dataset.kind = kind;
  el.innerHTML = h`<div class="tb"><div class="tb-seg" role="tablist" aria-label="${label}"><i class="tb-ind" aria-hidden="true"></i>${items.map(([id, name, href]) => h`<a role="tab" data-tab="${id}" href="${href}" class="${id === active ? 'on' : ''}" aria-selected="${id === active}">${name}</a>`)}</div>${avatarBtn(sp)}</div>`.s;
  settleIndicator(el, false);
}

// ---- the sliding highlight ----
const tabs = (el) => [...el.querySelectorAll('.tb-seg a')];
function putInd(el, left, width, animate) {
  const ind = el.querySelector('.tb-ind'); if (!ind) return;
  ind.style.transition = animate ? '' : 'none'; ind.style.width = width + 'px'; ind.style.transform = `translateX(${left}px)`;
}
/** Put the highlight under the active tab (animated unless told otherwise). */
export function settleIndicator(el = document.getElementById('appsw'), animate = true) {
  if (!el || el.hidden) return;
  const place = () => { const a = el.querySelector('.tb-seg a.on'); if (!a) return; putInd(el, a.offsetLeft, a.offsetWidth, animate); a.scrollIntoView?.({ block: 'nearest', inline: 'center', behavior: animate ? 'smooth' : 'auto' }); };
  place(); if (!animate) requestAnimationFrame(place);
}
/** While a finger drags a page, slide the highlight from one tab towards another by p (0..1). */
export function dragIndicator(fromId, toId, p) {
  const el = document.getElementById('appsw'); if (!el || el.hidden) return;
  const all = tabs(el), A = all.find((a) => a.dataset.tab === fromId), B = all.find((a) => a.dataset.tab === toId); if (!A || !B) return;
  const k = Math.max(0, Math.min(1, p));
  putInd(el, A.offsetLeft + (B.offsetLeft - A.offsetLeft) * k, A.offsetWidth + (B.offsetWidth - A.offsetWidth) * k, false);
  el.classList.add('dragging'); all.forEach((a) => a.classList.toggle('lit', a === (k > 0.5 ? B : A)));
}
/** Let go: glide the highlight the rest of the way to its tab. */
export function finishIndicator(toId, ms = 230) {
  const el = document.getElementById('appsw'); if (!el || el.hidden) return;
  const B = tabs(el).find((a) => a.dataset.tab === toId), ind = el.querySelector('.tb-ind'); if (!B || !ind) return;
  ind.style.transition = `transform ${ms}ms cubic-bezier(.22,.8,.24,1),width ${ms}ms cubic-bezier(.22,.8,.24,1)`; ind.style.width = B.offsetWidth + 'px'; ind.style.transform = `translateX(${B.offsetLeft}px)`;
  tabs(el).forEach((a) => a.classList.toggle('lit', a === B));
}
export function clearLit() { const el = document.getElementById('appsw'); el?.classList.remove('dragging'); el?.querySelectorAll('.tb-seg a.lit').forEach((a) => a.classList.remove('lit')); }
/** Which top-bar tab a page belongs to ('budgets', 'detail', ...), from a hash like "#/fire/detail/gap". */
export function barTabOf(hash) {
  const path = String(hash).replace(/^#\/?/, '').split('?')[0], [a, b] = path.split('/');
  if (MONEY.some((m) => m[0] === a)) return a;
  if (a === 'fire') return PLAN_OF[b || ''] || 'overview';
  return null;
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
