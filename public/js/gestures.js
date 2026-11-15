// Touch gestures for the whole app (no feature depends on them: every action still has a visible button).
//  1. Swipe left / right on a page to move between the pages of the top bar (Money: Transactions | Budgets | Wallets;
//     Plan: Overview > Detail tabs > Goals > Inputs > Live > Check-in > Guide).
//  2. Swipe down on a bottom sheet to close it.
// A swipe is ignored when it starts on something tappable (button, link, card link, field, slider, chart) or inside a
// sideways-scrolling strip, so pressing an item never turns into a page change.
import { swipeNeighbors } from './topbar.js';

const TAPPABLE = 'a,button,input,select,textarea,label,summary,[data-act],[data-menu],[data-term],[role=button],[role=tab],[role=slider],[tabindex]:not([tabindex="-1"]),svg [data-id],canvas,.fx-ex,.fx-hub';
const EDGE = 24;                     // px kept free at the screen edges for the system back gesture
const MIN_X = 64, MAX_SLOPE = 0.6;   // how far, and how straight, a page swipe has to be

function scrollsSideways(el, stop) {
  for (let n = el; n && n !== stop && n.nodeType === 1; n = n.parentElement) {
    const o = getComputedStyle(n).overflowX;
    if ((o === 'auto' || o === 'scroll') && n.scrollWidth > n.clientWidth + 2) return true;
  }
  return false;
}
const startsOnItem = (target, stop) => !!target.closest?.(TAPPABLE) || scrollsSideways(target, stop);

// ---------- 1. page swipes ----------
let page = null;
function onStart(e) {
  page = null;
  if (e.touches.length !== 1 || document.querySelector('.overlay')) return;
  const t = e.touches[0], tgt = e.target;
  if (!document.getElementById('view')?.contains(tgt)) return;               // only the page area, not the bars
  if (t.clientX < EDGE || t.clientX > innerWidth - EDGE) return;
  if (document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
  if (startsOnItem(tgt, document.getElementById('view'))) return;
  page = { x: t.clientX, y: t.clientY, t: Date.now() };
}
function onEnd(e) {
  const p = page; page = null; if (!p) return;
  const t = e.changedTouches[0], dx = t.clientX - p.x, dy = t.clientY - p.y;
  if (Math.abs(dx) < MIN_X || Math.abs(dy) > Math.abs(dx) * MAX_SLOPE || Date.now() - p.t > 700) return;
  if (getSelection()?.toString()) return;
  const nb = swipeNeighbors(location.hash.replace(/^#\/?/, '').split('?')[0]);
  const target = nb && (dx < 0 ? nb.next : nb.prev);
  if (!target) return;
  window.__slide = dx < 0 ? 'l' : 'r';                                       // the router reads this to slide the next page in
  location.hash = target;
}

// ---------- 2. swipe a sheet down to close it ----------
let drag = null;
function sheetStart(e) {
  drag = null;
  const sh = e.target.closest?.('.sheet'); if (!sh || e.touches.length !== 1) return;
  const onGrab = !!e.target.closest('.grab');
  if (!onGrab && startsOnItem(e.target, sh)) return;
  if (sh.scrollTop > 0 && !onGrab) return;                                    // let long sheets scroll first
  drag = { sh, y: e.touches[0].clientY, x: e.touches[0].clientX, dy: 0, t: Date.now(), on: false };
}
function sheetMove(e) {
  if (!drag) return;
  const t = e.touches[0], dy = t.clientY - drag.y, dx = t.clientX - drag.x;
  if (!drag.on) {
    if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy)) { drag = null; return; }       // a sideways move is not ours
    if (dy < 8) { if (dy < -8) drag = null; return; }                                    // only a downward pull
    drag.on = true; drag.sh.style.transition = 'none';
  }
  e.preventDefault(); drag.dy = Math.max(0, dy);
  drag.sh.style.transform = `translateY(${drag.dy}px)`;
  const ov = drag.sh.closest('.overlay'); if (ov) ov.style.background = `rgba(0,0,0,${Math.max(0.1, 0.55 - drag.dy / 700)})`;
}
function sheetEnd() {
  const d = drag; drag = null; if (!d || !d.on) return;
  const fast = d.dy / Math.max(1, Date.now() - d.t) > 0.6, ov = d.sh.closest('.overlay');
  if (d.dy > 110 || (fast && d.dy > 40)) {
    d.sh.style.transition = 'transform .18s ease-in'; d.sh.style.transform = 'translateY(110%)';
    if (ov) { ov.style.transition = 'opacity .18s'; ov.style.opacity = '0'; }
    setTimeout(() => ov?.remove(), 190);
  } else {
    d.sh.style.transition = 'transform .18s ease-out'; d.sh.style.transform = '';
    if (ov) ov.style.background = '';
  }
}

export function initGestures() {
  document.addEventListener('touchstart', (e) => { onStart(e); sheetStart(e); }, { passive: true });
  document.addEventListener('touchmove', sheetMove, { passive: false });
  document.addEventListener('touchend', (e) => { onEnd(e); sheetEnd(); }, { passive: true });
  document.addEventListener('touchcancel', () => { page = null; sheetEnd(); }, { passive: true });
}
