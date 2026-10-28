// FIRE planner entry point and router. Loaded on demand when someone opens #/fire, so the rest of the app never depends on it.
import { h, html, sheetOpen } from '../core.js';
import { on as onApp } from '../store.js';
import * as FS from './store.js';
import * as X from './ctx.js';
import { head, fxNav, IC, toast } from './ui.js';
import { linkTerms, openTerm } from './terms.js';

const cssHref = new URL('../../fire.css', import.meta.url).href;
function ensureCss() { if (!document.getElementById('fire-css')) { const l = document.createElement('link'); l.id = 'fire-css'; l.rel = 'stylesheet'; l.href = cssHref; document.head.append(l); } }

const SCREENS = {
  '': () => import('./overview.js').then((m) => m.overview),
  detail: () => import('./detail.js').then((m) => m.detail),
  goals: () => import('./goals.js').then((m) => m.goals),
  goal: () => import('./goals.js').then((m) => m.goalDetail),
  inputs: () => import('./inputs.js').then((m) => m.inputs),
  live: () => import('./live.js').then((m) => m.live),
  checkin: () => import('./checkin.js').then((m) => m.checkin),
  settings: () => import('./settings.js').then((m) => m.settings),
  wizard: () => import('./wizard.js').then((m) => m.wizard),
  prices: () => import('./prices.js').then((m) => m.prices),
  learn: () => import('./learn.js').then((m) => m.learn),
  how: () => import('./learn.js').then((m) => m.how),
};
const NAV_OF = { '': 'overview', detail: 'overview', goals: 'goals', goal: 'goals', inputs: 'inputs', live: 'live', checkin: 'checkin', settings: 'overview', prices: 'inputs', learn: 'overview', how: 'overview' };
let current = null, wired = false, timer = null;

let drawId = 0, lastKey = null, lastHtml = '', prefetched = false;
async function draw() {
  if (!current) return; const old = current.root, { parts } = current; if (!document.contains(old)) return;
  const id = ++drawId, [name = '', ...rest] = parts, key = parts.slice(0, 2).join('/');
  const loader = SCREENS[name]; if (!loader) { location.hash = '#/fire'; return; }
  // Build the next screen off to the side and swap it in when it is ready, so the old one stays visible (no blank flash) and no stale click handlers survive.
  const fresh = old.cloneNode(false), y = scrollY, sameScreen = key === lastKey;
  try { const fn = await loader(); await fn(fresh, { parts: rest, params: parts }); }
  catch (e) { console.error(e); html(fresh, h`<div class="fx"><div class="fx-note warn"><span>😕</span><div><b>This screen could not load.</b><div class="fx-sub">${e.message}</div></div></div>${fxNav(NAV_OF[name] || 'overview')}</div>`); }
  if (id !== drawId || !document.contains(old)) return;          // a newer navigation took over
  const box = fresh.querySelector('.fx'); addIntro(box, name, rest[0]); linkTerms(fresh);
  if (box && !sameScreen) box.classList.add('fx-enter');
  fresh.classList.remove('fx-stale'); old.replaceWith(fresh); current.root = fresh; lastKey = key; lastHtml = fresh.innerHTML;
  scrollTo(0, sameScreen ? y : 0);                                // a new screen opens at its top; a refresh of the same screen keeps your place
}
/** Warm the screens in the background so moving between tabs is instant after the first visit. */
function prefetch() { if (prefetched) return; prefetched = true; const run = () => Object.values(SCREENS).forEach((l) => l().catch(() => {})); (window.requestIdleCallback || ((f) => setTimeout(f, 1200)))(run); }
const rerenderSoon = () => { clearTimeout(timer); timer = setTimeout(() => { if (!sheetOpen()) draw(); }, 90); };

const INTROS = {
  '': ['Your answer', 'The big number is the money you need on retirement day. The coloured bar shows how much of it you are on course to have. Tap any underlined word to learn what it means.'],
  detail: ['Three ways to check', 'The same question answered three ways: a straight-line projection, a stress test of thousands of random futures, and what-if worlds. If they agree, you can trust the answer more.'],
  goals: ['Things you are saving for', 'Retirement always comes first. Add others, like a house or school fees, and set money aside for each.'],
  inputs: ['Your facts', 'The planner is only as good as what you put in here. Sections marked with a warning need a look. Everything recalculates the moment you change something.'],
  live: ['Your real month', 'Real income, spending and investing from the budget side of the app, compared with what your plan assumes.'],
  checkin: ['Progress over time', 'Save a dated snapshot of your plan, then compare later to see whether you are moving closer to the goal.'],
  settings: ['Plan settings', 'Rename the plan, back it up, import a backup, and choose how amounts are shown.'],
  prices: ['Keep values fresh', 'Type today\'s price for anything you track by units so its value stays up to date.'],
};
const introSeen = () => { try { return JSON.parse(localStorage.getItem('fire.intros') || '{}'); } catch { return {}; } };
function addIntro(box, name, sub) {
  const key = name || ''; const info = INTROS[key]; if (!box || !info || (name === 'detail' && sub === 'calc')) return;
  const seen = introSeen(); const headEl = box.querySelector('.fx-head'); if (!headEl) return;
  headEl.insertAdjacentHTML('afterend', seen[key] ? '' : `<div class="fx-intro" data-intro="${key}"><span class="ic">💡</span><div class="grow"><b>${info[0]}.</b> ${info[1]} <a class="fx-link" href="#/fire/learn">Open the guide</a></div><button type="button" data-intro-x="${key}" aria-label="Hide this tip">×</button></div>`);
  if (seen[key]) headEl.querySelector('.fx-head-right')?.insertAdjacentHTML('afterbegin', `<button class="fx-ib" data-intro-show="${key}" aria-label="What is this screen?">ⓘ</button>`);
}
let docWired = false;
function wireDoc() {
  if (docWired) return; docWired = true;
  document.addEventListener('click', (e) => {
    const t = e.target.closest?.('[data-term]'); if (t && document.querySelector('.fx')) { e.preventDefault(); t.closest('.overlay')?.remove(); openTerm(t.dataset.term); return; }
    const x = e.target.closest?.('[data-intro-x]'); if (x) { const s = introSeen(); s[x.dataset.introX] = 1; try { localStorage.setItem('fire.intros', JSON.stringify(s)); } catch {} x.closest('.fx-intro')?.remove(); return; }
    const sh = e.target.closest?.('[data-intro-show]'); if (sh) { const s = introSeen(); delete s[sh.dataset.introShow]; try { localStorage.setItem('fire.intros', JSON.stringify(s)); } catch {} X.redraw(); }
  });
  document.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target?.dataset?.term) { e.preventDefault(); openTerm(e.target.dataset.term); } });
  new MutationObserver((list) => { if (!document.querySelector('.fx')) return; for (const m of list) for (const n of m.addedNodes) if (n.nodeType === 1 && n.classList?.contains('overlay')) setTimeout(() => linkTerms(n), 30); }).observe(document.body, { childList: true });
}

function wire() {
  X.setRedraw(() => draw()); wireDoc();
  if (wired) return; wired = true;
  FS.onFire((evt) => { if (['edit', 'remote', 'mc', 'snapshots'].includes(evt)) rerenderSoon(); });
  onApp('change', () => { if (current && ['', 'live'].includes(current.parts[0] || '')) rerenderSoon(); });
}

export async function fireRoute(root, params) {
  ensureCss(); wire();
  const parts = String(params.rest || '').split('/').filter(Boolean); current = { root, parts }; lastKey = null;   // arriving by navigation: open at the top
  if (FS.fs.loaded && lastHtml) { root.innerHTML = lastHtml; root.classList.add('fx-stale'); }   // keep the previous screen on show until the next is ready
  else html(root, h`<div class="fx"><div class="fx-skel"></div><div class="fx-skel"></div><div class="fx-skel"></div></div>`);
  prefetch();
  if (!FS.fs.loaded) await FS.load();
  if (FS.fs.needsSetup) return setupScreen(root);
  if (FS.fs.error) return html(root, h`<div class="fx"><div class="fx-note warn"><span>😕</span><div><b>Could not load the FIRE planner.</b><div class="fx-sub">${FS.fs.error}</div><button class="fx-btn small" style="margin-top:10px" data-reload>Retry</button></div></div></div>`);
  if (!FS.fs.plan) { if (parts[0] !== 'wizard') { location.hash = '#/fire/wizard'; return; } }
  return draw();
}

async function setupScreen(root) {
  html(root, h`<div class="fx">${head({ kicker: 'FIRE PLANNER', title: 'One-time setup', back: '#/dashboard' })}
    <div class="fx-card"><h3>Create the planner's tables</h3><p class="fx-sub" style="margin-top:8px">The planner stores your plan in two new tables. This does not touch your wallets, transactions, budgets or accounts: it only adds new tables.</p>
      <ol style="padding-left:20px;line-height:1.7;margin-top:10px"><li>Tap <b>Copy setup SQL</b></li><li>Open your Supabase project, then <b>SQL Editor → New query</b></li><li>Paste, then <b>Run</b> (it should say Success)</li><li>Come back here and tap <b>Check again</b></li></ol>
      <div class="col" style="gap:10px;margin-top:14px"><button class="fx-btn" id="fx-copy">Copy setup SQL</button><button class="fx-btn ghost" id="fx-again">Check again</button></div></div></div>`);
  root.querySelector('#fx-copy').onclick = async () => { try { const t = await (await fetch(new URL('../../fire-setup.sql', import.meta.url))).text(); await navigator.clipboard.writeText(t); toast('SQL copied. Paste it into the Supabase SQL Editor.'); } catch { toast('Could not copy. Open supabase/fire.sql from the project instead.', true); } };
  root.querySelector('#fx-again').onclick = async () => { FS.fs.loaded = false; await FS.load({ force: true }); if (FS.fs.needsSetup) toast('Still not set up. Run the SQL, then try again.', true); else fireRoute(root, { rest: '' }); };
}
export { X };
