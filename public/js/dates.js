// Dates are handled as wall-clock 'YYYY-MM-DD' strings so no timezone maths leaks into budgets.
export const pad = (n) => String(n).padStart(2, '0');
export const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
export const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return { y, m, d }; };
export const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
export const isTime = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

export function todayIn(tz) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date()); }
  catch { return new Date().toISOString().slice(0, 10); }
}
const toUtc = (s) => { const { y, m, d } = parse(s); return Date.UTC(y, m - 1, d); };
const fromUtc = (ms) => { const t = new Date(ms); return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()); };
export const addDays = (s, n) => fromUtc(toUtc(s) + n * 86400000);
export const diffDays = (a, b) => Math.round((toUtc(b) - toUtc(a)) / 86400000);
export function addMonths(s, n) {
  const { y, m, d } = parse(s);
  const idx = y * 12 + (m - 1) + n;
  const ny = Math.floor(idx / 12), nm = (idx % 12) + 1;
  return ymd(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}
export const monthOf = (s) => s.slice(0, 7);
export const monthStart = (s) => s.slice(0, 7) + '-01';
export const monthEnd = (s) => { const { y, m } = parse(s); return ymd(y, m, daysInMonth(y, m)); };
export const addMonthKey = (key, n) => addMonths(key + '-01', n).slice(0, 7);
export const weekday = (s) => (new Date(toUtc(s)).getUTCDay() + 6) % 7; // Monday = 0

/** The period [start,end] that contains `today`. weekStart: 0 = Monday … 6 = Sunday. */
export const weekStartOf = (date, weekStart = 0) => addDays(date, -((weekday(date) - weekStart + 7) % 7));
export function periodWindow(period, today, weekStart = 0) {
  if (period === 'daily' || period === 'day') return { start: today, end: today };
  if (period === 'weekly' || period === 'week') { const s = weekStartOf(today, weekStart); return { start: s, end: addDays(s, 6) }; }
  if (period === 'year') { const y = today.slice(0, 4); return { start: `${y}-01-01`, end: `${y}-12-31` }; }
  return { start: monthStart(today), end: monthEnd(today) };
}
export function previousWindow(period, win) {
  if (period === 'daily') { const d = addDays(win.start, -1); return { start: d, end: d }; }
  if (period === 'weekly') return { start: addDays(win.start, -7), end: addDays(win.start, -1) };
  const s = addMonths(win.start, -1); return { start: s, end: monthEnd(s) };
}
/** Days left including the period's remaining days, never below 1. Matches the reference UI (31 - 20 = 11). */
export function daysLeft(period, today, win) {
  if (period === 'daily') return 1;
  return Math.max(1, diffDays(today, win.end));
}
export function periodsElapsed(period, startDate, today) {
  if (today < startDate) return 1;
  if (period === 'daily') return diffDays(startDate, today) + 1;
  if (period === 'weekly') return Math.floor(diffDays(startDate, today) / 7) + 1;
  const a = parse(startDate), b = parse(today);
  return (b.y - a.y) * 12 + (b.m - a.m) + 1;
}
