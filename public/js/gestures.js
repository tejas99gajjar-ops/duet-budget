// Touch gestures for the whole app. Nothing depends on them: every action still has a visible button.
//
//  1. PAGE SWIPE. Drag left or right on a page and it follows your finger straight away. The neighbouring page (real content,
//     rendered ahead of time) slides in from the side, and the highlight on the top bar slides along with it. Let go past the
//     halfway-ish mark or flick, and it completes; otherwise it springs back.
//     Pages: Money (Transactions | Budgets | Wallets) and Plan (My answer > Detail tabs > Goals > Inputs > Live > Check-in > Guide).
//  2. SHEET PULL-DOWN. In a bottom sheet, once you are at the top of its content, pull down from anywhere and it closes smoothly.
//  3. While a sheet is open the page behind it cannot be swiped, scrolled or changed.
//
// A page swipe is ignored when it starts on something tappable (button, link, card link, field, slider, chart) or inside a
// sideways-scrolling strip, so pressing an item never turns into a page change.
import { swipeNeighbors, barTabOf, dragIndicator, finishIndicator, settleIndicator, clearLit } from './topbar.js';

const TAPPABLE = 'a,button,input,select,textarea,label,summary,[data-act],[data-menu],[data-term],[role=button],[role=tab],[role=slider],[tabindex]:not([tabindex="-1"]),svg [data-id],canvas,.fx-ex,.fx-hub';
const FIELD = 'input,select,textarea,[contenteditable],[role=slider]';
const EDGE = 22;                      // px kept free at the screen edges for the system back gesture
const LOCK_X = 7, LOCK_RATIO = 1.1;   // how soon a sideways move takes over (very receptive)
const COMMIT = 0.24, FLICK = 0.4;     // share of the width, or px/ms, that completes a swipe
const EASE = 'cubic-bezier(.22,.8,.24,1)';

const $ = (id) => document.getElementById(id);
function scrollsSideways(el, stop) {
  for (let n = el; n && n !== stop && n.nodeType === 1; n = n.parentElement) {
    const o = getComputedStyle(n).overflowX;
    if ((o === 'auto' || o === 'scroll') && n.scrollWidth > n.clientWidth + 2) return true;
  }
  return false;
}

// ---------- neighbour previews (kept ready so a swipe never waits) ----------
const cache = new Map();
function preview(hash) {
  let p = cache.get(hash);
  if (!p || Date.now() - p.at > 45000) {
    const el = document.createElement('main'); el.className = 'pv';
    p = { el, at: Date.now(), ready: Promise.resolve(window.__duetPreview?.(hash, el)).catch(() => {}) };
    cache.set(hash, p);
  }
  return p;
}
export function clearPreviews() { cache.clear(); }
/** Called by the router once a page is on screen: render the pages either side so a swipe shows them at once. */
export function prefetchNeighbors() {
  const nb = swipeNeighbors(location.hash.replace(/^#\/?/, '').split('?')[0]); if (!nb) return;
  const run = () => { for (const h of [nb.next, nb.prev]) if (h) preview(h); };
  (window.requestIdleCallback || ((f) => setTimeout(f, 400)))(run, { timeout: 1500 });
}

// ---------- 1. page swipe ----------
let g = null, raf = 0;
function eligible(e) {
  if (e.touches.length !== 1 || document.querySelector('.overlay')) return false;
  const t = e.touches[0], tgt = e.target, view = $('view');
  if (!view?.contains(tgt) || t.clientX < EDGE || t.clientX > innerWidth - EDGE) return false;
  if (document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return false;
  return !(tgt.closest?.(TAPPABLE) || scrollsSideways(tgt, view));
}
function pageStart(e) {
  g = null; if (!eligible(e)) return;
  const path = location.hash.replace(/^#\/?/, '').split('?')[0], nb = swipeNeighbors(path); if (!nb) return;
  const t = e.touches[0];
  g = { x: t.clientX, y: t.clientY, nb, state: 'pending', from: barTabOf(location.hash), s: [[t.clientX, performance.now()]], tx: 0 };
  for (const h of [nb.next, nb.prev]) if (h) preview(h);            // warm them the moment a finger lands
}
function buildStage() {
  const app = $('app'), bar = $('appsw'), r = app.getBoundingClientRect(), top = bar && !bar.hidden ? bar.getBoundingClientRect().bottom : 0;
  const wrap = document.createElement('div'); wrap.className = 'pv-wrap';
  Object.assign(wrap.style, { left: r.left + 'px', width: r.width + 'px', top: Math.max(0, top) + 'px', bottom: '0px' });
  const slot = (side) => { const d = document.createElement('div'); d.className = 'pv-slot'; d.dataset.side = side; wrap.append(d); return d; };
  g.wrap = wrap; g.W = r.width; g.slots = { next: slot('next'), prev: slot('prev') };
  g.view = $('view'); g.view.style.willChange = 'transform';
  document.body.append(wrap);
  for (const side of ['next', 'prev']) { const h = g.nb[side]; if (h) g.slots[side].append(preview(h).el); }
}
function paint() {
  raf = 0; if (!g || g.state !== 'drag') return;
  const { W, tx, nb } = g, dir = tx < 0 ? 'next' : 'prev', has = !!nb[dir];
  g.view.style.transform = `translate3d(${tx}px,0,0)`;
  g.slots.next.style.transform = `translate3d(${W + tx}px,0,0)`; g.slots.prev.style.transform = `translate3d(${-W + tx}px,0,0)`;
  if (has) { const to = barTabOf(nb[dir]); dragIndicator(g.from, to, Math.abs(tx) / W); }
}
function pageMove(e) {
  if (!g || e.touches.length !== 1) return;
  const t = e.touches[0], dx = t.clientX - g.x, dy = t.clientY - g.y;
  if (g.state === 'pending') {
    if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { g = null; return; }                      // it is a scroll
    if (Math.abs(dx) < LOCK_X || Math.abs(dx) < Math.abs(dy) * LOCK_RATIO) return;
    if (getSelection()?.toString()) { g = null; return; }
    g.state = 'drag'; buildStage();
  }
  if (g.state !== 'drag') return;
  if (e.cancelable) e.preventDefault();
  const dir = dx < 0 ? 'next' : 'prev';
  g.tx = g.nb[dir] ? Math.max(-g.W, Math.min(g.W, dx)) : dx * 0.28;                                  // nothing that way: a soft rubber band
  g.s.push([t.clientX, performance.now()]); if (g.s.length > 6) g.s.shift();
  if (!raf) raf = requestAnimationFrame(paint);
}
function pageEnd() {
  const s = g; if (!s) return; g = null;
  if (s.state !== 'drag') return;
  cancelAnimationFrame(raf); raf = 0;
  const a = s.s[0], b = s.s[s.s.length - 1], v = b[1] > a[1] ? (b[0] - a[0]) / (b[1] - a[1]) : 0;   // px per ms, signed
  const dir = s.tx < 0 ? 'next' : 'prev', target = s.nb[dir];
  const commit = !!target && (Math.abs(s.tx) > s.W * COMMIT || (Math.abs(v) > FLICK && (v < 0) === (dir === 'next')));
  const end = commit ? (dir === 'next' ? -s.W : s.W) : 0, ms = commit ? 230 : 200;
  const tr = `transform ${ms}ms ${EASE}`;
  for (const el of [s.view, s.slots.next, s.slots.prev]) el.style.transition = tr;
  s.view.style.transform = `translate3d(${end}px,0,0)`;
  s.slots.next.style.transform = `translate3d(${s.W + end}px,0,0)`; s.slots.prev.style.transform = `translate3d(${-s.W + end}px,0,0)`;
  if (commit) { if (barTabOf(target)) finishIndicator(barTabOf(target), ms); }
  else { const ind = $('appsw')?.querySelector('.tb-ind'); if (ind) ind.style.transition = ''; settleIndicator($('appsw'), true); }
  setTimeout(() => {
    s.view.style.transition = ''; s.view.style.willChange = '';
    if (commit) {
      window.__swipeDone = () => { s.wrap.remove(); window.__swipeDone = null; clearLit(); $('appsw')?.classList.remove('dragging'); };   // the router calls this once the real page is drawn
      setTimeout(() => window.__swipeDone?.(), 2500);                                                                                 // safety net
      location.hash = target;
    } else { s.view.style.transform = ''; s.wrap.remove(); clearLit(); $('appsw')?.classList.remove('dragging'); }
  }, ms + 10);
}

// ---------- 2. sheet pull-down ----------
let sd = null, sraf = 0;
function sheetStart(e) {
  sd = null;
  const sh = e.target.closest?.('.sheet'); if (!sh || e.touches.length !== 1) return;
  if (e.target.closest(FIELD) || scrollsSideways(e.target, sh)) return;
  const t = e.touches[0];
  sd = { sh, ov: sh.closest('.overlay'), x: t.clientX, y: t.clientY, atTop: sh.scrollTop <= 0, on: false, dy: 0, s: [[t.clientY, performance.now()]] };
}
function sheetMove(e) {
  if (!sd || e.touches.length !== 1) return;
  const t = e.touches[0], dy = t.clientY - sd.y, dx = t.clientX - sd.x;
  if (!sd.on) {
    if (!sd.atTop) return;                                                                               // began mid-scroll: the content scrolls; a new pull is needed
    if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) { sd = null; return; }                          // sideways: not ours
    if (dy < -6) { sd = null; return; }                                                                   // upwards: let it scroll
    if (dy < 6) return;
    if (sd.sh.scrollTop > 0) { sd = null; return; }
    sd.on = true; sd.y = t.clientY - 6; sd.sh.style.transition = 'none'; sd.sh.style.willChange = 'transform';
  }
  if (e.cancelable) e.preventDefault();
  sd.dy = Math.max(0, t.clientY - sd.y); sd.s.push([t.clientY, performance.now()]); if (sd.s.length > 6) sd.s.shift();
  if (!sraf) sraf = requestAnimationFrame(() => { sraf = 0; if (!sd) return; sd.sh.style.transform = `translate3d(0,${sd.dy}px,0)`; if (sd.ov) sd.ov.style.background = `rgba(0,0,0,${Math.max(0, 0.55 * (1 - sd.dy / (innerHeight * 0.6)))})`; });
}
function sheetEnd() {
  const d = sd; sd = null; if (!d || !d.on) return; cancelAnimationFrame(sraf); sraf = 0;
  const a = d.s[0], b = d.s[d.s.length - 1], v = b[1] > a[1] ? (b[0] - a[0]) / (b[1] - a[1]) : 0;       // px per ms, + is downwards
  if (d.dy > 90 || (v > 0.5 && d.dy > 24)) {
    const ms = 220; d.sh.style.transition = `transform ${ms}ms cubic-bezier(.4,0,.9,.6)`; d.sh.style.transform = 'translate3d(0,105%,0)';
    if (d.ov) { d.ov.style.transition = `background ${ms}ms linear`; d.ov.style.background = 'rgba(0,0,0,0)'; }
    setTimeout(() => d.ov?.remove(), ms + 10);
  } else {
    d.sh.style.transition = `transform 220ms ${EASE}`; d.sh.style.transform = '';
    if (d.ov) { d.ov.style.transition = 'background 220ms linear'; d.ov.style.background = ''; }
    setTimeout(() => { d.sh.style.willChange = ''; }, 240);
  }
}

// ---------- 3. a sheet locks the page behind it ----------
function lockWatcher() {
  const sync = () => document.body.classList.toggle('has-sheet', !!document.querySelector('.overlay'));
  new MutationObserver(sync).observe(document.body, { childList: true }); sync();
}

export function initGestures() {
  document.addEventListener('touchstart', (e) => { pageStart(e); sheetStart(e); }, { passive: true });
  document.addEventListener('touchmove', (e) => { pageMove(e); sheetMove(e); }, { passive: false });
  document.addEventListener('touchend', () => { pageEnd(); sheetEnd(); }, { passive: true });
  document.addEventListener('touchcancel', () => { pageEnd(); sheetEnd(); }, { passive: true });
  lockWatcher();
}
