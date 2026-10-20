import { state, loadBoot, h, html, toast, sheetOpen, pref, setPref, applyTheme } from './core.js';
import { createSupabaseBackend } from './backend.js';
import * as S from './store.js';
import * as auth from './auth.js';
import * as tx from './tx.js';
import * as money from './money.js';
import * as an from './analytics.js';
import * as settings from './settings.js';

const nav = document.getElementById('nav');
let current = null, refreshTimer = null;

const routes = [
  ['welcome', auth.welcome, { public: true }], ['login', auth.login, { public: true }], ['signup', auth.signup, { public: true }], ['setup', auth.setup, { setup: true }],
  ['dashboard', tx.dashboard, { tab: 'dashboard', live: true }], ['wallets', money.wallets, { tab: 'wallets', live: true }],
  ['wallet/:id', money.walletDetail, { tab: 'wallets', live: true }], ['budgets', money.budgets, { tab: 'budgets', live: true }],
  ['analytics', an.analytics, { tab: 'analytics', live: true }], ['portfolio', money.portfolio, { live: true, noNav: true }],
  ['transactions', tx.list, { live: true, noNav: true }], ['tx/new', tx.form, { noNav: true }], ['tx/:id/edit', tx.form, { noNav: true }],
  ['tx/:id', tx.detail, { live: true, noNav: true }], ['settings', settings.main, { live: true, tab: '' }], ['profile', settings.profile, { noNav: true }],
  ['activity', settings.activity, { live: true, noNav: true }], ['recurring', settings.recurring, { live: true, noNav: true }],
].map(([p, fn, opts]) => ({ re: new RegExp('^' + p.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), fn, ...opts }));

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '') || '';
  const [path, query = ''] = raw.split('?'); return { path, q: Object.fromEntries(new URLSearchParams(query)) };
}
const fresh = () => { const old = document.getElementById('view'); const el = document.createElement('main'); el.id = 'view'; el.setAttribute('aria-live', 'polite'); old.replaceWith(el); return el; };
const signedIn = () => !!S.state.user;
const hasSpace = () => !!S.state.data?.space;

async function afterAuth() { await S.init(); if (hasSpace()) await loadBoot(); location.hash = hasSpace() ? '#/dashboard' : '#/setup'; await render(); }

async function render({ keepScroll = false } = {}) {
  const { path, q } = parseHash(), y = keepScroll ? scrollY : 0;
  if (!S.state.backend) { nav.hidden = true; return auth.needsConfig(fresh()); }
  if (!path) { location.hash = signedIn() ? (hasSpace() ? '#/dashboard' : '#/setup') : '#/welcome'; return; }
  const r = routes.find((x) => x.re.test(path));
  if (!r) { location.hash = '#/dashboard'; return; }
  if (!r.public && !signedIn()) { location.hash = '#/welcome'; return; }
  if (r.public && signedIn()) { location.hash = hasSpace() ? '#/dashboard' : '#/setup'; return; }
  if (signedIn() && !hasSpace() && !r.setup) { location.hash = '#/setup'; return; }
  if (r.setup && (!signedIn() || hasSpace())) { location.hash = signedIn() ? '#/dashboard' : '#/welcome'; return; }
  if (hasSpace()) await loadBoot();
  current = r;
  const root = fresh(), showNav = !r.public && !r.setup && !r.noNav && r.tab !== undefined;
  nav.hidden = !showNav; root.classList.toggle('noNav', !showNav);
  nav.querySelectorAll('a[data-tab]').forEach((a) => a.classList.toggle('on', a.dataset.tab === r.tab));
  html(root, h`<div class="spin">Loading…</div>`);
  try { await r.fn(root, { ...r.re.exec(path).groups, ...q }, afterAuth); }
  catch (e) { if (e.message !== 'Please sign in') html(root, h`<div class="empty"><span class="e">😕</span>${e.message}<br><br><button class="btn small" data-reload>Retry</button></div>`); }
  scrollTo(0, y);
}

// ---- sync status bar: offline / syncing, plus live refresh when the cloud data changes ----
const bar = document.getElementById('syncbar');
function updateBar() {
  const n = S.pending(); let msg = '';
  if (signedIn() && !S.state.online) msg = `Offline · ${n ? `${n} change${n === 1 ? '' : 's'} saved on this device` : 'showing saved data'}`;
  else if (n) msg = `Syncing ${n} change${n === 1 ? '' : 's'}…`;
  bar.textContent = msg; bar.hidden = !msg;
}
S.on('sync', () => { updateBar(); const p = document.getElementById('syncpill'); if (p) p.textContent = S.state.live ? '● live' : S.state.online ? 'connecting…' : 'offline'; });
S.on('sync-error', (m) => toast('One offline change could not be saved: ' + m, true));
S.on('change', () => {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => { if (current?.live && !sheetOpen() && !document.hidden) render({ keepScroll: true }).catch(() => {}); }, 150);
});

window.addEventListener('hashchange', () => render());
window.addEventListener('duet:unauth', () => { state.boot = null; S.signedOut().finally(() => { location.hash = '#/welcome'; render(); }); });
document.addEventListener('click', (e) => { if (e.target.closest('[data-reload]')) return location.reload(); const t = e.target.closest('[data-theme-toggle]'); if (!t) return;
  setPref('theme', document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'); applyTheme(); });
matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', () => pref('theme', 'system') === 'system' && applyTheme());
document.addEventListener('visibilitychange', () => { if (!document.hidden && signedIn() && S.state.online) S.flush().catch(() => {}); });

// If a phone renders the page in 'Desktop site' mode (viewport much wider than the device screen), scale the page to fit the screen.
function fitScreen() {
  const root = document.documentElement, coarse = matchMedia('(pointer:coarse)').matches;
  const z = coarse && screen.width && innerWidth > screen.width * 1.25 ? innerWidth / screen.width : 1;
  root.style.zoom = z === 1 ? '' : String(z); root.style.setProperty('--z', String(z));
}
fitScreen(); addEventListener('resize', fitScreen); addEventListener('orientationchange', () => setTimeout(fitScreen, 200));

if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});

(async function start() {
  S.configure(window.DUET_TEST_BACKEND || createSupabaseBackend(window.DUET_CONFIG)); // DUET_TEST_BACKEND is only set by test/harness
  if (S.state.backend) {
    S.state.backend.auth.onSignedOut(() => window.dispatchEvent(new Event('duet:unauth')));
    try { await S.init(); } catch (e) { html(fresh(), h`<div class="empty"><span class="e">😕</span>Could not reach Supabase: ${e.message}<br><br><button class="btn small" data-reload>Retry</button></div>`); return; }
  }
  updateBar(); await render();
})();
