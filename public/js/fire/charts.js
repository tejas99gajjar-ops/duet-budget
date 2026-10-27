// SVG charts for the planner. Each returns a Safe string; colours come from CSS variables so both themes work.
import { raw } from '../core.js';
import { inrC } from './format.js';

const C = { purple: 'var(--fx)', purple2: 'var(--fx2)', amber: 'var(--fx-warn)', green: 'var(--fx-ok)', red: 'var(--fx-bad)', blue: 'var(--fx-blue)', grid: 'var(--fx-line)', txt: 'var(--muted)' };
const nice = (max) => { if (max <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(max))); const f = max / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; };
const svg = (w, h, inner, label) => raw(`<svg class="fx-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="${label || 'chart'}" preserveAspectRatio="xMidYMid meet">${inner}</svg>`);
const T = (x, y, s, o = {}) => `<text x="${x}" y="${y}" font-size="${o.size || 10.5}" fill="${o.fill || C.txt}" text-anchor="${o.anchor || 'middle'}" font-weight="${o.weight || 500}">${s}</text>`;

/** Corpus bars over time with a dashed target line. Bars turn green once the target is reached. */
export function projectionBars(rows, target, { retireYear, w = 340, h = 210 } = {}) {
  const padL = 44, padR = 8, padT = 12, padB = 26; const iw = w - padL - padR, ih = h - padT - padB;
  const vals = rows.map((r) => r.corpus || 0); const max = nice(Math.max(target * 1.15, ...vals, 1));
  const y = (v) => padT + ih - (v / max) * ih; const n = rows.length, slot = iw / Math.max(1, n), bw = Math.max(3, Math.min(20, slot * 0.62));
  let g = '';
  for (let i = 0; i <= 4; i++) { const v = (max / 4) * i; g += `<line x1="${padL}" x2="${w - padR}" y1="${y(v)}" y2="${y(v)}" stroke="${C.grid}" stroke-dasharray="3 4"/>${T(padL - 6, y(v) + 3.5, inrC(v), { anchor: 'end' })}`; }
  const step = Math.max(1, Math.ceil(n / 6));
  const bars = rows.map((r, i) => {
    const x = padL + i * slot + (slot - bw) / 2, v = r.corpus || 0, col = v >= target ? C.green : i < n * 0.4 ? C.purple : C.amber;
    const lab = i % step === 0 || r.year === retireYear ? T(x + bw / 2, h - 8, r.year, { weight: r.year === retireYear ? 800 : 500, fill: r.year === retireYear ? C.amber : C.txt }) : '';
    return `<rect x="${x}" y="${y(v)}" width="${bw}" height="${Math.max(0, padT + ih - y(v))}" rx="4" fill="${col}"><title>${r.year} · ${inrC(v)}</title></rect>${lab}`;
  }).join('');
  const tl = `<line x1="${padL}" x2="${w - padR}" y1="${y(target)}" y2="${y(target)}" stroke="${C.purple2}" stroke-width="1.6" stroke-dasharray="6 5"/>`;
  return svg(w, h, g + bars + tl, 'Corpus projection');
}

/** Line (optionally filled) through points. xs are labels, ys numbers. */
export function lineChart(ys, xs, { w = 340, h = 150, color = C.green, fill = true, target = null, fmt = inrC, yMin = null, yMax = null, dots = [], dashed = false, pct = false, highlightLast = true } = {}) {
  const padL = 40, padR = 10, padT = 10, padB = 22, iw = w - padL - padR, ih = h - padT - padB;
  const lo0 = yMin ?? Math.min(...ys, target ?? Infinity), hi0 = yMax ?? Math.max(...ys, target ?? -Infinity);
  const span = (hi0 - lo0) || Math.abs(hi0) || 1, lo = yMin ?? lo0 - span * 0.15, hi = yMax ?? hi0 + span * 0.15;
  const X = (i) => padL + (ys.length === 1 ? iw / 2 : (i / (ys.length - 1)) * iw), Y = (v) => padT + ih - ((v - lo) / (hi - lo || 1)) * ih;
  let g = ''; for (let i = 0; i <= 3; i++) { const v = lo + ((hi - lo) / 3) * i; g += `<line x1="${padL}" x2="${w - padR}" y1="${Y(v)}" y2="${Y(v)}" stroke="${C.grid}" stroke-dasharray="3 4"/>${T(padL - 6, Y(v) + 3.5, pct ? `${Math.round(v * 100)}%` : fmt(v), { anchor: 'end' })}`; }
  const path = ys.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ');
  const area = fill ? `<path d="${path} L${X(ys.length - 1)} ${padT + ih} L${X(0)} ${padT + ih} Z" fill="${color}" opacity=".16"/>` : '';
  const tl = target != null ? `<line x1="${padL}" x2="${w - padR}" y1="${Y(target)}" y2="${Y(target)}" stroke="${C.red}" stroke-dasharray="5 4"/>` : '';
  const step = Math.max(1, Math.ceil(xs.length / 8)); const xl = xs.map((x, i) => (i % step === 0 || i === xs.length - 1 ? T(X(i), h - 6, x, { weight: i === xs.length - 1 ? 800 : 500, fill: i === xs.length - 1 ? color : C.txt }) : '')).join('');
  const dd = dots.map((i) => `<circle cx="${X(i)}" cy="${Y(ys[i])}" r="4.5" fill="${C.purple}"/>`).join('') + (highlightLast ? `<circle cx="${X(ys.length - 1)}" cy="${Y(ys[ys.length - 1])}" r="5" fill="${color}"/>` : '');
  return svg(w, h, g + area + tl + `<path d="${path}" fill="none" stroke="${color}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round" ${dashed ? 'stroke-dasharray="6 5"' : ''}/>` + dd + xl, 'Trend');
}

/** Monte Carlo fan: 10–90 and 25–75 bands, median line, target line. */
export function fanChart(fan, { target, retireAge, w = 340, h = 200, fromAge, toAge } = {}) {
  const padL = 44, padR = 10, padT = 12, padB = 24, iw = w - padL - padR, ih = h - padT - padB;
  const a0 = fromAge ?? fan.ages[0], a1 = toAge ?? fan.ages[fan.ages.length - 1];
  const idx = fan.ages.map((a, i) => i).filter((i) => fan.ages[i] >= a0 && fan.ages[i] <= a1);
  if (!idx.length) return svg(w, h, '', 'fan');
  const max = nice(Math.max(target * 1.15, ...idx.map((i) => fan.p90[i]), 1));
  const X = (i) => padL + ((fan.ages[i] - a0) / Math.max(1, a1 - a0)) * iw, Y = (v) => padT + ih - (v / max) * ih;
  const band = (lo, hi, op) => { const top = idx.map((i, k) => `${k ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(fan[hi][i]).toFixed(1)}`).join(' '); const bot = [...idx].reverse().map((i) => `L${X(i).toFixed(1)} ${Y(fan[lo][i]).toFixed(1)}`).join(' '); return `<path d="${top} ${bot} Z" fill="${C.purple}" opacity="${op}"/>`; };
  let g = ''; for (let i = 0; i <= 4; i++) { const v = (max / 4) * i; g += `<line x1="${padL}" x2="${w - padR}" y1="${Y(v)}" y2="${Y(v)}" stroke="${C.grid}" stroke-dasharray="3 4"/>${T(padL - 6, Y(v) + 3.5, inrC(v), { anchor: 'end' })}`; }
  const med = idx.map((i, k) => `${k ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(fan.p50[i]).toFixed(1)}`).join(' ');
  const ages = []; for (let a = Math.ceil(a0 / 5) * 5; a <= a1; a += 5) ages.push(a);
  const xl = ages.map((a) => T(padL + ((a - a0) / Math.max(1, a1 - a0)) * iw, h - 6, a, { weight: a === retireAge ? 800 : 500, fill: a === retireAge ? C.amber : C.txt })).join('');
  const rx = retireAge != null && retireAge >= a0 && retireAge <= a1 ? `<line x1="${padL + ((retireAge - a0) / Math.max(1, a1 - a0)) * iw}" x2="${padL + ((retireAge - a0) / Math.max(1, a1 - a0)) * iw}" y1="${padT}" y2="${padT + ih}" stroke="${C.amber}" stroke-opacity=".5"/>` : '';
  return svg(w, h, g + band('p10', 'p90', 0.2) + band('p25', 'p75', 0.35) + rx + `<line x1="${padL}" x2="${w - padR}" y1="${Y(target)}" y2="${Y(target)}" stroke="${C.red}" stroke-dasharray="5 4"/>` + T(w - padR, Y(target) - 4, 'TARGET', { anchor: 'end', fill: C.red, size: 9.5, weight: 800 }) + `<path d="${med}" fill="none" stroke="${C.amber}" stroke-width="2.6" stroke-linejoin="round"/>` + xl, 'Monte Carlo corpus range');
}

/** Half-ring gauge / progress ring with the percentage in the middle. */
export function ring(frac, { size = 150, stroke = 14, color = C.amber, label = 'success', big = null } = {}) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, frac));
  return raw(`<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${Math.round(f * 100)}% ${label}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--fx-tile)" stroke-width="${stroke}"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${f * c} ${c}" transform="rotate(-90 ${size / 2} ${size / 2})"/><text x="50%" y="${big ? '48%' : '52%'}" text-anchor="middle" fill="var(--text)" font-size="${size * 0.24}" font-weight="800">${big ?? Math.round(f * 100) + '%'}</text><text x="50%" y="${big ? '64%' : '66%'}" text-anchor="middle" fill="${C.txt}" font-size="${size * 0.085}">${label}</text></svg>`);
}

/** Stacked bars: rows = [{label, parts:[{v,color}]}]. */
export function stackedBars(rows, { w = 340, h = 190, fmt = inrC, labelEvery = null } = {}) {
  const padL = 44, padR = 8, padT = 10, padB = 24, iw = w - padL - padR, ih = h - padT - padB;
  const max = nice(Math.max(...rows.map((r) => r.parts.reduce((s, p) => s + Math.max(0, p.v), 0)), 1));
  const Y = (v) => padT + ih - (v / max) * ih, slot = iw / rows.length, bw = Math.max(3, Math.min(22, slot * 0.66)); let g = '';
  for (let i = 0; i <= 3; i++) { const v = (max / 3) * i; g += `<line x1="${padL}" x2="${w - padR}" y1="${Y(v)}" y2="${Y(v)}" stroke="${C.grid}" stroke-dasharray="3 4"/>${T(padL - 6, Y(v) + 3.5, fmt(v), { anchor: 'end' })}`; }
  const step = labelEvery || Math.max(1, Math.ceil(rows.length / 7));
  const bars = rows.map((r, i) => { let acc = 0; const x = padL + i * slot + (slot - bw) / 2; const segs = r.parts.map((p) => { const y0 = Y(acc + Math.max(0, p.v)), hgt = Math.max(0, Y(acc) - y0); acc += Math.max(0, p.v); return `<rect x="${x}" y="${y0}" width="${bw}" height="${hgt}" fill="${p.color}"/>`; }).join(''); return `<g>${segs}${i % step === 0 ? T(x + bw / 2, h - 7, r.label) : ''}<title>${r.label}</title></g>`; }).join('');
  return svg(w, h, g + bars, 'Stacked bars');
}

/** Horizontal tornado: each item has low and high gap values around a base. */
export function tornado(items, base, { w = 340 } = {}) {
  const rowH = 34, h = items.length * rowH + 28, padL = 4, padR = 4, cx = w / 2;
  const maxD = Math.max(...items.flatMap((i) => [Math.abs(i.low - base), Math.abs(i.high - base)]), 1), sc = (w / 2 - 12) / maxD;
  const rows = items.map((it, k) => {
    const y = 14 + k * rowH, dl = it.low - base, dh = it.high - base;
    const bar = (d, col) => `<rect x="${d < 0 ? cx + d * sc : cx}" y="${y + 14}" width="${Math.abs(d) * sc}" height="14" rx="5" fill="${col}"/>`;
    return `${T(padL, y + 8, it.label, { anchor: 'start', fill: 'var(--text)', size: 11.5, weight: 700 })}${bar(dl, dl <= 0 ? C.green : C.red)}${bar(dh, dh <= 0 ? C.green : C.red)}`;
  }).join('');
  return svg(w, h, `<line x1="${cx}" x2="${cx}" y1="6" y2="${h - 14}" stroke="${C.grid}"/>${rows}${T(cx - 8, h - 2, '← smaller gap', { anchor: 'end', size: 9.5 })}${T(cx + 8, h - 2, 'bigger gap →', { anchor: 'start', size: 9.5 })}`, 'Sensitivity');
}

/** Grid of coloured cells. cells[r][c] = {label, tone:'ok'|'warn'|'bad', mark} */
export function heat(rowsLabels, cols, cells, { w = 340 } = {}) {
  const padL = 78, rowH = 40, top = 22, cw = (w - padL) / cols.length, h = top + rowsLabels.length * rowH + 4;
  const tone = { ok: 'var(--fx-ok)', warn: 'var(--fx-warn)', bad: 'var(--fx-bad)', none: 'var(--fx-tile)' };
  let s = cols.map((c, i) => T(padL + i * cw + cw / 2, 14, c, { size: 10.5 })).join('');
  rowsLabels.forEach((rl, r) => { s += T(2, top + r * rowH + 24, rl, { anchor: 'start', fill: 'var(--text)', size: 11.5, weight: 700 }); cols.forEach((c, i) => { const cell = cells[r][i]; s += `<rect x="${padL + i * cw + 2}" y="${top + r * rowH + 3}" width="${cw - 4}" height="${rowH - 6}" rx="8" fill="${tone[cell.tone || 'none']}" fill-opacity="${cell.tone ? 0.28 : 1}" ${cell.mark ? `stroke="${C.purple2}" stroke-width="2"` : ''} ${cell.attr || ''} ${cell.attr ? 'style="cursor:pointer"' : ''}/>${T(padL + i * cw + cw / 2, top + r * rowH + 24, cell.label, { fill: 'var(--text)', size: 10.5, weight: 700 })}`; }); });
  return svg(w, h, s, 'Heatmap');
}

/** Waterfall: steps = [{label, value, kind:'total'|'delta'}] */
export function waterfall(steps, { w = 340, h = 190, fmt = inrC } = {}) {
  const padL = 44, padR = 8, padT = 14, padB = 34, iw = w - padL - padR, ih = h - padT - padB;
  let acc = 0; const bars = steps.map((s) => { const start = s.kind === 'total' ? 0 : acc, end = s.kind === 'total' ? s.value : acc + s.value; acc = end; return { ...s, lo: Math.min(start, end), hi: Math.max(start, end) }; });
  const max = nice(Math.max(...bars.map((b) => b.hi), 1)), min0 = Math.min(0, ...bars.map((b) => b.lo)), span = max - min0;
  const Y = (v) => padT + ih - ((v - min0) / span) * ih, slot = iw / bars.length, bw = slot * 0.6;
  let g = ''; for (let i = 0; i <= 3; i++) { const v = min0 + (span / 3) * i; g += `<line x1="${padL}" x2="${w - padR}" y1="${Y(v)}" y2="${Y(v)}" stroke="${C.grid}" stroke-dasharray="3 4"/>${T(padL - 6, Y(v) + 3.5, fmt(v), { anchor: 'end' })}`; }
  const body = bars.map((b, i) => { const x = padL + i * slot + (slot - bw) / 2; const col = b.kind === 'total' ? C.purple : b.value < 0 ? C.red : C.green; return `<rect x="${x}" y="${Y(b.hi)}" width="${bw}" height="${Math.max(2, Y(b.lo) - Y(b.hi))}" rx="5" fill="${col}"/>${T(x + bw / 2, Y(b.hi) - 4, fmt(b.value), { size: 10, weight: 700, fill: 'var(--text)' })}${T(x + bw / 2, h - 18, b.label, { size: 10 })}`; }).join('');
  return svg(w, h, g + body, 'Waterfall');
}

export const sparkline = (ys, { w = 120, h = 34, color = C.green } = {}) => {
  if (ys.length < 2) return raw('');
  const lo = Math.min(...ys), hi = Math.max(...ys), X = (i) => 2 + (i / (ys.length - 1)) * (w - 4), Y = (v) => h - 3 - ((v - lo) / (hi - lo || 1)) * (h - 6);
  return raw(`<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><path d="${ys.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"/></svg>`);
};

/** Small column chart of a gap / success value for each retirement age (the Overview strip). */
export function ageStrip(rows, { selected, earliest, mode = 'gap', w = 340, h = 96 } = {}) {
  const n = rows.length, slot = (w - 8) / n, bw = Math.min(14, slot * 0.62);
  const vals = rows.map((r) => (mode === 'gap' ? -r.gap : r.success ?? 0)); const absMax = Math.max(...vals.map(Math.abs), 1);
  const base = mode === 'gap' ? h * 0.52 : h - 22; let s = mode === 'gap' ? `<line x1="4" x2="${w - 4}" y1="${base}" y2="${base}" stroke="${C.grid}"/>` : '';
  rows.forEach((r, i) => {
    const v = vals[i], x = 4 + i * slot + (slot - bw) / 2; const hh = mode === 'gap' ? (Math.abs(v) / absMax) * (h * 0.38) : v * (h - 36); const up = mode === 'gap' ? v >= 0 : true;
    const col = mode === 'gap' ? (v >= 0 ? C.green : C.red) : v >= 0.8 ? C.green : v >= 0.6 ? C.amber : C.red;
    s += `<rect data-act="age" data-age="${r.age}" x="${x}" y="${up ? base - hh : base}" width="${bw}" height="${Math.max(2, hh)}" rx="3.5" fill="${col}" opacity="${r.age === selected ? 1 : 0.62}" ${r.age === selected ? `stroke="${C.purple2}" stroke-width="2"` : ''} style="cursor:pointer"><title>Age ${r.age}</title></rect>`;
    if (i % 3 === 0 || r.age === selected) s += T(x + bw / 2, h - 6, r.age, { fill: r.age === selected ? C.purple2 : C.txt, weight: r.age === selected ? 800 : 500, size: 10 });
    if (r.age === earliest) s += T(x + bw / 2, 10, '⚑', { size: 11, fill: C.green });
  });
  return svg(w, h, s, 'Retirement age comparison');
}

/** Several lines on one chart: series = [{ys, color, label}] */
export function multiLine(series, xs, { w = 340, h = 170, target = null, fmt = inrC } = {}) {
  const padL = 44, padR = 10, padT = 10, padB = 22, iw = w - padL - padR, ih = h - padT - padB;
  const all = series.flatMap((s) => s.ys).concat(target != null ? [target] : []); const hi = nice(Math.max(...all, 1)), lo = 0;
  const X = (i) => padL + (xs.length === 1 ? iw / 2 : (i / (xs.length - 1)) * iw), Y = (v) => padT + ih - ((v - lo) / (hi - lo)) * ih;
  let g = ''; for (let i = 0; i <= 3; i++) { const v = (hi / 3) * i; g += `<line x1="${padL}" x2="${w - padR}" y1="${Y(v)}" y2="${Y(v)}" stroke="${C.grid}" stroke-dasharray="3 4"/>${T(padL - 6, Y(v) + 3.5, fmt(v), { anchor: 'end' })}`; }
  const lines = series.map((s) => `<path d="${s.ys.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ')}" fill="none" stroke="${s.color}" stroke-width="2.6" stroke-linejoin="round"/>`).join('');
  const step = Math.max(1, Math.ceil(xs.length / 7)); const xl = xs.map((x, i) => (i % step === 0 ? T(X(i), h - 6, x) : '')).join('');
  const tl = target != null ? `<line x1="${padL}" x2="${w - padR}" y1="${Y(target)}" y2="${Y(target)}" stroke="${C.red}" stroke-dasharray="5 4"/>` : '';
  return svg(w, h, g + tl + lines + xl, 'Comparison');
}
