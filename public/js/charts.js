import { h, raw } from './core.js';

// Budget colour scale: green until half-way, then through amber to red as the limit approaches.
const STOPS = [[0, [29, 219, 151]], [0.5, [29, 219, 151]], [0.75, [245, 166, 35]], [1, [240, 68, 68]]];
export function barColor(frac) {
  const f = Math.min(1, Math.max(0, frac || 0));
  for (let i = 1; i < STOPS.length; i++) {
    const [b, cb] = STOPS[i], [a, ca] = STOPS[i - 1];
    if (f <= b) { const t = (f - a) / (b - a || 1); return `rgb(${ca.map((v, k) => Math.round(v + (cb[k] - v) * t)).join(',')})`; }
  }
  return 'rgb(240,68,68)';
}
/** Progress bar whose fill colour follows barColor(frac). */
export const bar = (frac) => raw(`<div class="bar" role="progressbar" aria-valuenow="${Math.round(frac * 100)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${Math.min(100, Math.max(frac > 0 ? 1.5 : 0, frac * 100))}%;background:${barColor(frac)}"></i></div>`);

/** Donut chart: slices = [{value,color}] */
export function donut(slices, center, { size = 200, stroke = 26 } = {}) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, total = slices.reduce((s, x) => s + x.value, 0);
  let off = 0;
  const arcs = total ? slices.map((s) => { const len = (s.value / total) * c; const a = `<circle ${s.id != null ? `data-act="cat" data-id="${s.id}" style="cursor:pointer;opacity:${s.dim ? 0.25 : 1}"` : ''} cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${stroke}" stroke-dasharray="${Math.max(0, len - 2)} ${c}" stroke-dashoffset="${-off}" transform="rotate(-90 ${size / 2} ${size / 2})"/>`; off += len; return a; }).join('')
    : `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--inner)" stroke-width="${stroke}"/>`;
  return raw(`<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img">${arcs}<text x="50%" y="48%" text-anchor="middle" fill="var(--text)" font-size="22" font-weight="800">${center[0]}</text><text x="50%" y="62%" text-anchor="middle" fill="var(--muted)" font-size="12">${center[1]}</text></svg>`);
}

/** Progress ring with a percentage label. */
export function ring(frac, status, size = 120) {
  const stroke = 14, r = (size - stroke) / 2, c = 2 * Math.PI * r, f = Math.min(1, Math.max(0, frac));
  const col = barColor(frac);
  return raw(`<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${Math.round(frac * 100)}% spent"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--inner)" stroke-width="${stroke}"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${col}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${f * c} ${c}" transform="rotate(-90 ${size / 2} ${size / 2})"/><text x="50%" y="55%" text-anchor="middle" fill="var(--text)" font-size="26" font-weight="800">${Math.round(frac * 100)}%</text></svg>`);
}

/** Grouped income/expense bars. months = [{label, income, expense, projected, current}] in cents. */
export function cashflowBars(months, fmt) {
  const W = 320, H = 170, pad = 28, base = H - 28, top = 10;
  const max = Math.max(1, ...months.flatMap((m) => [m.income, m.expense]));
  const nice = (() => { const p = 10 ** Math.floor(Math.log10(max)); return Math.ceil(max / p) * p; })();
  const slot = (W - pad) / months.length, bw = Math.min(22, slot / 2 - 3), y = (v) => base - (v / nice) * (base - top);
  const grid = [0, 0.5, 1].map((g) => `<line x1="${pad}" x2="${W}" y1="${y(nice * g)}" y2="${y(nice * g)}" stroke="var(--line)" stroke-dasharray="3 4"/><text x="0" y="${y(nice * g) + 4}" font-size="9" fill="var(--dim)">${fmt(nice * g)}</text>`).join('');
  const bars = months.map((m, i) => {
    const x0 = pad + i * slot + slot / 2, dash = m.projected ? 'stroke-dasharray="4 3" fill-opacity=".25" stroke-width="1.5"' : 'stroke-width="0"';
    const rect = (x, v, col) => v > 0 ? `<rect x="${x}" y="${y(v)}" width="${bw}" height="${base - y(v)}" rx="5" fill="${col}" stroke="${col}" ${dash}/>` : '';
    const hit = m.key ? `<rect data-act="bucket" data-key="${m.key}" x="${x0 - slot / 2}" y="0" width="${slot}" height="${H}" fill="transparent" style="cursor:pointer"><title>${m.label}: ${fmt(m.income)} in, ${fmt(m.expense)} out</title></rect>` : '';
    return `${m.current ? `<rect x="${x0 - slot / 2 + 2}" y="0" width="${slot - 4}" height="${H}" rx="8" fill="var(--accent)" opacity=".07"/>` : ''}${rect(x0 - bw - 2, m.income, 'var(--accent)')}${rect(x0 + 2, m.expense, 'var(--red)')}<text x="${x0}" y="${H - 8}" text-anchor="middle" font-size="11" font-weight="${m.current ? 800 : 500}" fill="${m.current ? 'var(--accent)' : 'var(--muted)'}">${m.label}</text>${hit}`;
  }).join('');
  return raw(`<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Monthly cashflow">${grid}${bars}</svg>`);
}

/** Horizontal stacked bar, parts = [{value,color}] */
export function stack(parts) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  return h`<div class="row" style="gap:3px;height:12px">${parts.filter((p) => p.value > 0).map((p) => h`<i style="flex:${p.value / total};background:${p.color};border-radius:6px;height:12px"></i>`)}</div>`;
}
