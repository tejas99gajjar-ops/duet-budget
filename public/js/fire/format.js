// Rupee, percent and date formatting for the planner (lakh / crore, as in the designs).
const trim = (n, d) => { const s = n.toFixed(d); return s.includes('.') ? s.replace(/\.?0+$/, '') : s; };
const sgn = (v, opt) => (v < 0 ? '-' : opt?.sign && v > 0 ? '+' : '');

/** ₹3.2 crore, ₹30 lakh, ₹85,000 */
export function inr(v, opt = {}) {
  if (v == null || Number.isNaN(v)) return '—';
  const a = Math.abs(v), s = sgn(v, opt);
  if (a >= 1e7) return `${s}₹${trim(a / 1e7, 2)} crore`;
  if (a >= 1e5) return `${s}₹${trim(a / 1e5, 2)} lakh`;
  return `${s}₹${Math.round(a).toLocaleString('en-IN')}`;
}
/** ₹2.9Cr, ₹85L, ₹85K, ₹850 */
export function inrC(v, opt = {}) {
  if (v == null || Number.isNaN(v)) return '—';
  const a = Math.abs(v), s = sgn(v, opt);
  if (a >= 1e7) return `${s}₹${trim(a / 1e7, 2)}Cr`;
  if (a >= 1e5) return `${s}₹${trim(a / 1e5, a >= 1e6 ? 1 : 2)}L`;
  if (a >= 1e3) return `${s}₹${trim(a / 1e3, 1)}K`;
  return `${s}₹${Math.round(a)}`;
}
/** ₹1,85,000 */
export const inrF = (v, opt = {}) => (v == null || Number.isNaN(v) ? '—' : `${sgn(v, opt)}₹${Math.round(Math.abs(v)).toLocaleString('en-IN')}`);
export const num = (v, d = 0) => (v == null || Number.isNaN(v) ? '—' : Number(v).toLocaleString('en-IN', { maximumFractionDigits: d }));
export const pc = (f, d = 0) => (f == null || Number.isNaN(f) ? '—' : `${(f * 100).toFixed(d)}%`);
export const pp = (v, d = 1) => (v == null ? '—' : `${trim(Number(v), d)}%`);

/** Parse a typed rupee amount ("1,85,000", "1.85L", "85k", "2cr") into a number. NaN if invalid. */
export function parseINR(str) {
  const s = String(str ?? '').trim().toLowerCase().replace(/[₹,\s]/g, '');
  if (!s) return NaN;
  const m = s.match(/^(-?\d*\.?\d+)(cr|crore|l|lakh|lac|k)?$/);
  if (!m) return NaN;
  const mult = { cr: 1e7, crore: 1e7, l: 1e5, lakh: 1e5, lac: 1e5, k: 1e3 }[m[2]] || 1;
  return Number(m[1]) * mult;
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthYear = (ym) => { if (!ym) return '—'; const [y, m] = String(ym).split('-'); return `${MON[(Number(m) || 1) - 1]} ${y}`; };
export const dmy = (d) => { if (!d) return '—'; const [y, m, day] = String(d).split('-'); return `${day ? String(Number(day)).padStart(2, '0') + ' ' : ''}${MON[Number(m) - 1]} ${y}`; };
export const yrs = (n) => (n == null ? '—' : n < 1 ? 'this year' : `${Math.round(n)} yr${Math.round(n) === 1 ? '' : 's'} away`);
export const ago = (d) => { if (!d) return 'never'; const s = (Date.now() - new Date(d).getTime()) / 1000; if (s < 90) return 'just now'; if (s < 3600) return `${Math.round(s / 60)} mins ago`; if (s < 86400) return `${Math.round(s / 3600)} hrs ago`; return `${Math.round(s / 86400)} days ago`; };
export const statusLabel = { ahead: 'Ahead', 'on-track': 'On track', behind: 'Behind' };
