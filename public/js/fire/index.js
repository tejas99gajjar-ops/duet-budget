// FIRE planner entry point and router. Loaded on demand when someone opens #/fire, so the rest of the app never depends on it.
import { h, html, sheetOpen } from '../core.js';
import { on as onApp } from '../store.js';
import * as FS from './store.js';
import * as X from './ctx.js';
import { head, fxNav, fxTop, IC, toast } from './ui.js';

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
};
const NAV_OF = { '': 'overview', detail: 'overview', goals: 'goals', goal: 'goals', inputs: 'inputs', live: 'live', checkin: 'checkin', settings: 'overview', prices: 'inputs' };
let current = null, wired = false, timer = null;

async function draw() {
  if (!current) return; let { root, parts } = current; if (!document.contains(root)) return;
  const fresh = root.cloneNode(false); root.replaceWith(fresh); root = current.root = fresh;       // new element = no stale click handlers
  const [name = '', ...rest] = parts; const y = scrollY;
  const loader = SCREENS[name]; if (!loader) { location.hash = '#/fire'; return; }
  try { const fn = await loader(); await fn(root, { parts: rest, params: parts }); }
  catch (e) { console.error(e); html(root, h`<div class="fx"><div class="fx-note warn"><span>😕</span><div><b>This screen could not load.</b><div class="fx-sub">${e.message}</div></div></div>${fxNav(NAV_OF[name] || 'overview')}</div>`); }
  const box = root.querySelector('.fx'); if (box && !box.querySelector('.fx-top')) box.insertAdjacentHTML('afterbegin', fxTop().s);
  scrollTo(0, y);
}
const rerenderSoon = () => { clearTimeout(timer); timer = setTimeout(() => { if (!sheetOpen()) draw(); }, 90); };

function wire() {
  X.setRedraw(() => draw());
  if (wired) return; wired = true;
  FS.onFire((evt) => { if (['edit', 'remote', 'mc', 'snapshots'].includes(evt)) rerenderSoon(); });
  onApp('change', () => { if (current && ['', 'live'].includes(current.parts[0] || '')) rerenderSoon(); });
}

export async function fireRoute(root, params) {
  ensureCss(); wire();
  const parts = String(params.rest || '').split('/').filter(Boolean); current = { root, parts };
  html(root, h`<div class="fx"><div class="fx-skel"></div><div class="fx-skel"></div><div class="fx-skel"></div></div>`);
  if (!FS.fs.loaded) await FS.load();
  if (FS.fs.needsSetup) return setupScreen(root);
  if (FS.fs.error) return html(root, h`<div class="fx"><div class="fx-note warn"><span>😕</span><div><b>Could not load the FIRE planner.</b><div class="fx-sub">${FS.fs.error}</div><button class="fx-btn small" style="margin-top:10px" data-reload>Retry</button></div></div></div>`);
  if (!FS.fs.plan) { if (parts[0] !== 'wizard') { location.hash = '#/fire/wizard'; return; } }
  return draw();
}

async function setupScreen(root) {
  html(root, h`<div class="fx">${fxTop()}${head({ kicker: 'FIRE PLANNER', title: 'One-time setup', back: '#/dashboard' })}
    <div class="fx-card"><h3>Create the planner's tables</h3><p class="fx-sub" style="margin-top:8px">The planner stores your plan in two new tables. This does not touch your wallets, transactions, budgets or accounts: it only adds new tables.</p>
      <ol style="padding-left:20px;line-height:1.7;margin-top:10px"><li>Tap <b>Copy setup SQL</b></li><li>Open your Supabase project, then <b>SQL Editor → New query</b></li><li>Paste, then <b>Run</b> (it should say Success)</li><li>Come back here and tap <b>Check again</b></li></ol>
      <div class="col" style="gap:10px;margin-top:14px"><button class="fx-btn" id="fx-copy">Copy setup SQL</button><button class="fx-btn ghost" id="fx-again">Check again</button></div></div></div>`);
  root.querySelector('#fx-copy').onclick = async () => { try { const t = await (await fetch(new URL('../../fire-setup.sql', import.meta.url))).text(); await navigator.clipboard.writeText(t); toast('SQL copied. Paste it into the Supabase SQL Editor.'); } catch { toast('Could not copy. Open supabase/fire.sql from the project instead.', true); } };
  root.querySelector('#fx-again').onclick = async () => { FS.fs.loaded = false; await FS.load({ force: true }); if (FS.fs.needsSetup) toast('Still not set up. Run the SQL, then try again.', true); else fireRoute(root, { rest: '' }); };
}
export { X };
