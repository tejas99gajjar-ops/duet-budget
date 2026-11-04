// Gap section: "When you start matters". For each start point, how much extra to invest every month (and what pay that implies) to close the gap.
import { h, raw } from './ui.js';
import * as X from './ctx.js';
import { roadmap } from './engine.js';
import { inr, inrC, pc } from './format.js';

const tone = (r) => (r.extra == null ? 'bad' : r.raisePct <= 0.12 ? 'ok' : r.raisePct <= 0.3 ? 'warn' : 'bad');
const COLOR = { ok: 'var(--fx-ok)', warn: 'var(--fx-warn)', bad: 'var(--fx-bad)' };
const lab = (k) => (k === 0 ? 'Today' : k === 1 ? '1 yr' : `${k} yrs`);

function chart(rows, sel) {
  const w = 340, hh = 190, pl = 8, pr = 8, pt = 26, pb = 36, iw = w - pl - pr, ih = hh - pt - pb, ok = rows.filter((r) => r.extra != null), max = Math.max(...ok.map((r) => r.extra), 1), slot = iw / rows.length, bw = Math.min(40, slot * 0.62);
  const bars = rows.map((r, i) => {
    const x = pl + i * slot + slot / 2, t = tone(r), v = r.extra == null ? ih : Math.max(4, Math.sqrt(r.extra / max) * ih), y = pt + ih - v, on = r.k === sel;
    return `<g data-rm="${r.k}" style="cursor:pointer"><rect x="${x - slot / 2}" y="0" width="${slot}" height="${hh}" fill="transparent"/><rect x="${x - bw / 2}" y="${y}" width="${bw}" height="${v}" rx="7" fill="${r.extra == null ? 'var(--fx-line)' : COLOR[t]}" opacity="${on ? 1 : 0.55}" ${on ? 'stroke="var(--text)" stroke-width="2"' : ''}/><text x="${x}" y="${y - 7}" font-size="11" font-weight="800" fill="var(--text)" text-anchor="middle">${r.extra == null ? 'n/a' : inrC(r.extra)}</text><text x="${x}" y="${hh - 18}" font-size="11" font-weight="${on ? 800 : 600}" fill="${on ? 'var(--text)' : 'var(--muted)'}" text-anchor="middle">${lab(r.k)}</text><text x="${x}" y="${hh - 5}" font-size="10" fill="var(--dim)" text-anchor="middle">${r.year}</text></g>`;
  }).join('');
  return raw(`<svg class="fx-chart" viewBox="0 0 ${w} ${hh}" role="img" aria-label="Extra monthly investment needed by start year">${bars}</svg>`);
}

function detail(R, k, C) {
  const r = R.at(k), t = tone(r), gapNow = R.gap > 0;
  if (!gapNow) return h`<div class="fx-note"><span>✅</span><div>No extra is needed: you are already on course.</div></div>`;
  if (r.extra == null) return h`<div class="fx-note warn"><span>⚠️</span><div><b>Extra investing alone cannot close the gap if you start in ${r.year}.</b> Combine it with a later retirement age or lower retirement spending.</div></div>`;
  const earn = r.raisePct, ratio = Math.min(1, r.shareOfIncome);
  return h`<div class="fx-rm-d"><div class="fx-rm-h"><div class="fx-sub">Start in ${r.year} · age ${r.age}</div><div class="fx-mid" style="color:${COLOR[t]}">+${inr(r.extra)}<span class="fx-sub" style="font-size:14px"> a month</span></div><div class="fx-sub">${inr(r.real)} in today's money, then rising ${(R.st * 100).toFixed(1)}% a year with your pay</div></div>
    <div class="fx-grid3"><div class="fx-tile"><div class="l">Invest in total</div><div class="v">${inrC(r.total)}</div><div class="s">${inrC(r.sipThen)} now + extra</div></div>
      <div class="fx-tile"><div class="l">Of your pay</div><div class="v ${t}">${pc(r.shareOfIncome)}</div><div class="s">take-home ${inrC(r.income)}</div></div>
      <div class="fx-tile"><div class="l">Or a raise of</div><div class="v ${t}">${inrC(r.extra)}</div><div class="s">+${pc(earn)} take-home</div></div></div>
    <div class="fx-rm-bar"><i style="width:${ratio * 100}%;background:${COLOR[t]}"></i></div>
    <div class="fx-sub">${t === 'ok' ? 'Comfortable: a small part of your pay.' : t === 'warn' ? 'A stretch: plan it alongside a raise or other cuts.' : 'Heavy: consider also retiring later or spending less.'}</div></div>`;
}

export function roadmapCard(plan, res) {
  if (res.gap.amount <= 0) return { html: '', mount() {} };
  const R = roadmap(plan, { today: X.today() }); if (!R.rows.length) return { html: '', mount() {} };
  const C = (v) => X.conv(v, res), w = R.rows.find((r) => r.k === 0) || R.rows[0], late = R.rows[R.rows.length - 1];
  const costOfWaiting = w.extra != null && late.extra != null && late.k > 0 ? late.extra / w.extra : null;
  let sel = 0;
  const html = h`<div class="fx-card" id="roadmap"><div class="fx-ch"><h3>What to invest, and when</h3></div>
    <div class="fx-sub" style="margin-bottom:8px">Extra you must invest each month, from the start you pick, to close the ${inr(C(res.gap.amount))} gap. Starting later costs more every month, because there is less time to grow.</div>
    <div id="rm-chart">${chart(R.rows, sel)}</div>
    <div class="fx-legend" style="margin:4px 0 10px"><span><i style="background:var(--fx-ok)"></i>Comfortable</span><span><i style="background:var(--fx-warn)"></i>A stretch</span><span><i style="background:var(--fx-bad)"></i>Heavy</span></div>
    <div class="fx-lab-r" style="margin-top:6px"><div class="fx-row fx-between"><label for="rm-sl">If I start in</label><b id="rm-lv">Today</b></div><input id="rm-sl" type="range" class="fx-slider" min="0" max="${R.maxYears}" step="1" value="0" aria-label="Years until you start"><div class="fx-sl-ends"><span>Today</span><span>${R.maxYears} yrs</span></div></div>
    <div id="rm-detail" style="margin-top:10px">${detail(R, 0, C)}</div>
    ${costOfWaiting ? h`<div class="fx-note" style="margin-top:12px"><span>⏳</span><div>Waiting ${late.k} years makes the monthly amount <b>${costOfWaiting.toFixed(1)}×</b> larger (${inrC(w.extra)} today vs ${inrC(late.extra)} in ${late.year}).</div></div>` : ''}
    <div class="fx-help" style="margin-top:8px">Amounts are rupees of the start year. "Of your pay" compares total investing with your take-home then (pay growing ${(R.st * 100).toFixed(1)}% a year). Bar heights use a square-root scale so the early, affordable starts stay visible. Moving a slider or tapping a bar changes nothing in your plan.</div></div>`;
  const mount = (root) => {
    const sl = root.querySelector('#rm-sl'); if (!sl) return;
    const go = (k) => { sel = k; sl.value = k; root.querySelector('#rm-lv').textContent = lab(k) + (k ? ` · ${R.at(k).year}` : ''); root.querySelector('#rm-chart').innerHTML = chart(R.rows.some((r) => r.k === k) ? R.rows : [...R.rows, R.at(k)].sort((a, b) => a.k - b.k), k).s; root.querySelector('#rm-detail').innerHTML = detail(R, k, C).s; };
    sl.addEventListener('input', () => go(Number(sl.value)));
    root.querySelector('#rm-chart').addEventListener('click', (e) => { const g = e.target.closest('[data-rm]'); if (g) go(Number(g.dataset.rm)); });
  };
  return { html, mount };
}
