// Shared helpers: safe HTML templating, API client, formatting, sheets and toasts.
class Safe { constructor(s) { this.s = s; } toString() { return this.s; } }
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
const render = (v) => v instanceof Safe ? v.s : Array.isArray(v) ? v.map(render).join('') : v === false || v == null ? '' : esc(v);
/** Tagged template that escapes every interpolation unless it is itself an h`` result. */
export const h = (strings, ...vals) => new Safe(strings.reduce((out, s, i) => out + s + (i < vals.length ? render(vals[i]) : ''), ''));
export const raw = (s) => new Safe(s);
export const html = (el, safe) => { el.innerHTML = safe.s; };

export const state = { boot: null, summaryDirty: true };

import { request, downloadCsv } from './local-api.js';
export { downloadCsv };
export async function api(method, path, body) { return request(method, path, body); }
export const get = (p) => api('GET', p);
export const qs = (o) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(o)) if (v !== '' && v != null) p.set(k, v); const s = p.toString(); return s ? '?' + s : ''; };

export async function loadBoot() { state.boot = await get('/bootstrap'); return state.boot; } // local: reads the in-memory cache, no network
export const space = () => state.boot.space;
export const me = () => state.boot.user;
export const cats = (kind) => state.boot.categories.filter((c) => !kind || c.kind === kind);
export const catById = (id) => state.boot.categories.find((c) => c.id === id);
export const wallets = () => state.boot.wallets;
export const walletById = (id) => state.boot.wallets.find((w) => w.id === id);
export const memberById = (id) => space().members.find((m) => m.id === id);

// ---------- formatting ----------
const fmtCache = {};
export function money(cents, { sign = false, decimals = true, compact = false } = {}) {
  const cur = space()?.currency || 'USD';
  const key = cur + decimals + compact;
  fmtCache[key] ||= new Intl.NumberFormat('en-US', { style: 'currency', currency: cur, minimumFractionDigits: decimals && !compact ? 2 : 0, maximumFractionDigits: decimals && !compact ? 2 : 0, notation: compact ? 'compact' : 'standard' });
  const s = fmtCache[key].format(Math.abs(cents) / 100);
  return cents < 0 ? '-' + s : sign && cents > 0 ? '+' + s : s;
}
export const currencySymbol = () => (0).toLocaleString('en-US', { style: 'currency', currency: space().currency, minimumFractionDigits: 0 }).replace(/[\d\s]/g, '');
export function parseCents(str) {
  const m = String(str).replace(/[,\s]/g, '').match(/^(-?)(\d*)(?:\.(\d{0,2})\d*)?$/);
  if (!m || (m[2] === '' && !m[3])) return NaN;
  return (m[1] ? -1 : 1) * (Number(m[2] || 0) * 100 + Number((m[3] || '').padEnd(2, '0')));
}
export const centsToInput = (c) => (c / 100).toFixed(2);
export const pct = (x) => Math.round(x * 100) + '%';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthName = (key, full = false) => (full ? FULL : MONTHS)[Number(key.slice(5, 7)) - 1];
export const pref = (k, fallback = '') => { try { return localStorage.getItem('duet.' + k) ?? fallback; } catch { return fallback; } };
export const setPref = (k, v) => { try { localStorage.setItem('duet.' + k, v); } catch {} };
export const DATE_FORMATS = { mdy: 'Oct 20, 2026', dmy: '20 Oct 2026', us: '10/20/2026', eu: '20/10/2026', iso: '2026-10-20' };
export function niceDate(d) {
  const [y, m, day] = d.split('-').map(Number), p2 = (n) => String(n).padStart(2, '0');
  switch (pref('dateFmt', 'mdy')) { case 'dmy': return `${day} ${MONTHS[m - 1]} ${y}`; case 'us': return `${p2(m)}/${p2(day)}/${y}`; case 'eu': return `${p2(day)}/${p2(m)}/${y}`; case 'iso': return d; default: return `${MONTHS[m - 1]} ${day}, ${y}`; }
}
export function applyTheme() {
  const t = pref('theme', 'system'), dark = t === 'system' ? !matchMedia('(prefers-color-scheme: light)').matches : t === 'dark';
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const meta = document.querySelector('meta[name=theme-color]'); if (meta) meta.content = dark ? '#0D1117' : '#F3F5FA';
}
export function time12(t) { const [hh, mm] = t.split(':').map(Number); return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`; }
export function dayLabel(d) {
  const today = state.boot.today; const diff = Math.round((Date.parse(today) - Date.parse(d)) / 864e5);
  return diff === 0 ? 'Today' : diff === 1 ? 'Yesterday' : niceDate(d);
}
export const initials = (n) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0].toUpperCase()).join('');
export const avatar = (m) => h`<span class="avatar" style="background:${m.color}" title="${m.name}">${initials(m.name)}</span>`;
export const byChip = (userId) => { const m = memberById(userId); return m ? h`<span class="by" style="background:${m.color}" title="${m.name}">${initials(m.name)[0]}</span>` : ''; };

// ---------- icons ----------
export const I = {
  back: raw('<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>'),
  close: raw('<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>'),
  edit: raw('<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4zM13 7l4 4"/></svg>'),
  trash: raw('<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>'),
  sun: raw('<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/></svg>'),
  moon: raw('<svg viewBox="0 0 24 24"><path d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10z"/></svg>'),
  gear: raw('<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2-1.2L14 3h-4l-.6 2.6a7 7 0 0 0-2 1.2l-2.3-.9-2 3.4 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2 1.2L10 21h4l.6-2.6a7 7 0 0 0 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z"/></svg>'),
  plus: raw('<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>'),
  search: raw('<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6"/><path d="M16 16l4 4"/></svg>'),
  download: raw('<svg viewBox="0 0 24 24"><path d="M12 4v10M7 10l5 5 5-5M5 19h14"/></svg>'),
  chev: raw('<svg viewBox="0 0 24 24" width="16" height="16"><path d="M9 5l7 7-7 7"/></svg>'),
  clock: raw('<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'),
};
export const iconBtn = (act, icon, label, extra = '') => h`<button class="iconbtn" data-act="${act}" aria-label="${label}" ${raw(extra)}>${icon}</button>`;

// ---------- ui plumbing ----------
export function toast(msg, isErr = false) {
  const t = document.createElement('div'); t.className = 'toast' + (isErr ? ' err' : ''); t.textContent = msg;
  document.getElementById('toasts').append(t); setTimeout(() => t.remove(), isErr ? 4200 : 2400);
}
export const errToast = (e) => toast(e.message || String(e), true);

/** Delegated click/input/change/submit handling: data-act="name" → handlers.click.name(el, event). */
export function bind(root, handlers) {
  for (const type of ['click', 'input', 'change', 'submit']) {
    if (!handlers[type]) continue;
    root.addEventListener(type, async (e) => {
      const el = e.target.closest?.('[data-act]'); const fn = el && handlers[type][el.dataset.act];
      if (!fn) return;
      if (type === 'submit') e.preventDefault();
      try { await fn(el, e); } catch (err) { errToast(err); }
    });
  }
}
export function sheet(content, handlers = {}) {
  const ov = document.createElement('div'); ov.className = 'overlay';
  ov.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${content.s}</div>`;
  const close = () => ov.remove();
  ov.addEventListener('click', (e) => { if (e.target === ov) close(); });
  bind(ov, { ...handlers, click: { close, ...(handlers.click || {}) } });
  document.body.append(ov);
  ov.querySelector('input:not([type=hidden]),select')?.focus?.();
  return { el: ov, close };
}
export const sheetOpen = () => !!document.querySelector('.overlay');
export function confirmSheet(title, text, label = 'Delete') {
  return new Promise((resolve) => {
    const s = sheet(h`<h1 style="font-size:20px">${title}</h1><p class="muted">${text}</p>
      <div class="row"><button class="btn ghost" data-act="no">Cancel</button><button class="btn danger" data-act="yes">${label}</button></div>`,
      { click: { no: () => { s.close(); resolve(false); }, yes: () => { s.close(); resolve(true); }, close: () => { s.close(); resolve(false); } } });
  });
}
export const COLORS = ['#1DDB97', '#7C5FE6', '#F5A623', '#3B82F6', '#F04444', '#E879A0'];
export const swatches = (selected, name = 'color') => h`<div class="swatches" data-group="${name}">${COLORS.map((c) => h`<button type="button" class="swatch ${c === selected ? 'on' : ''}" data-act="swatch" data-v="${c}" style="background:${c}" aria-label="Color ${c}"></button>`)}</div>`;
export const WALLET_ICON = { bank: '🏦', cash: '💵', savings: '🐷', shared: '👥' };
export const txIcon = (t) => t.type === 'transfer' ? '⇄' : (t.category?.icon || '•');
