// Gap section: "What to invest, and when". For each start point and each scenario: the extra to invest every month (and the pay or spending cut that implies) to close the gap, and who carries it.
import { h, raw } from './ui.js';
import * as X from './ctx.js';
import { roadmapScenarios, splitRow } from './engine.js';
import { inr, inrC, pc } from './format.js';

const tone = (r) => (r.extra == null ? 'bad' : r.raisePct == null ? 'bad' : r.raisePct <= 0.12 ? 'ok' : r.raisePct <= 0.3 ? 'warn' : 'bad');
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

const verdict = (t) => (t === 'ok' ? 'Comfortable: a small part of pay.' : t === 'warn' ? 'A stretch: pair it with a raise or other cuts.' : 'Heavy: also consider retiring later or spending less.');

export function roadmapCard(plan, res) {
  const all = roadmapScenarios(plan, { today: X.today() }), activeId = plan.settings.activeScenarioId || 'base';
  const cur = all.find((s) => s.scenario.id === activeId) || all.find((s) => s.scenario.id === 'base') || all[0];
  if (!cur || cur.R.gap <= 0 || !cur.R.rows.length) return { html: '', mount() {} };
  const C = (v) => X.conv(v, res), st = { sc: cur.scenario.id, k: 0, you: null };
  const R = () => all.find((s) => s.scenario.id === st.sc).R, people = plan.profile.people, two = people.length > 1;
  const chartRows = () => { const r = R(); return r.rows.some((x) => x.k === st.k) ? r.rows : [...r.rows, r.at(st.k)].sort((a, b) => a.k - b.k); };

  const picker = () => h`<div class="fx-chips" role="group" aria-label="Scenario">${all.map(({ scenario, R: q }) => h`<button type="button" class="fx-opt ${scenario.id === st.sc ? 'on' : ''}" data-rmsc="${scenario.id}">${scenario.icon || ''} ${scenario.name}${scenario.id === activeId ? ' · yours' : ''}${q.gap <= 0 ? ' ✓' : ''}</button>`)}</div>`;

  const who = (row) => {
    if (!two) return '';
    const dflt = splitRow(row), youDef = Math.round((dflt[0]?.share ?? 1) * 100), you = st.you ?? youDef;
    const rows = splitRow(row, { [people[0].id]: you / 100, [people[1].id]: 1 - you / 100 }), byPay = splitRow(row);
    const card = (p, i) => {
      const t = p.extra == null ? 'bad' : p.pay > 0 ? tone({ extra: p.extra, raisePct: p.raisePct }) : p.extra > 0 ? 'bad' : 'ok';
      return h`<div class="fx-tile"><div class="l"><b>${p.name}</b> · ${Math.round(p.share * 100)}%</div>
        <div class="v ${t}">${p.extra == null ? 'n/a' : `+${inrC(p.extra)}`}<span class="fx-sub" style="font-size:12px"> /mo</span></div>
        <div class="s">invests ${p.total == null ? '—' : inrC(p.total)} in total (${inrC(p.sip)} now)</div>
        <div class="s">${p.pay > 0 ? `${p.shareOfPay == null ? '' : `${pc(p.shareOfPay)} of pay ${inrC(p.pay)} · raise of +${pc(p.raisePct)}`}` : p.extra > 0 ? 'no pay in this year: would need new income' : 'no pay in this year'}</div>
        <div class="s">${row.spendCut == null ? '' : `spend cut share: ${inrC(byPay[i].spendCut)}/mo`}</div></div>`;
    };
    return h`<div class="fx-rm-who"><div class="fx-lbl" style="margin:14px 0 6px">WHO CARRIES IT</div>
      <div class="fx-row fx-between"><b data-rmy>${people[0].name || 'You'} ${you}%</b><b data-rmp>${people[1].name || 'Partner'} ${100 - you}%</b></div>
      <input type="range" class="fx-slider" id="rm-split" min="0" max="100" step="5" value="${you}" aria-label="Share carried by ${people[0].name || 'you'}">
      <div class="fx-sl-ends"><span>${people[0].name || 'You'} 0%</span><span>${st.you == null ? `by pay (${youDef}%)` : raw('<button type="button" class="fx-link" data-rmreset style="font-size:12px">back to by pay</button>')}</span><span>100%</span></div>
      <div class="fx-grid2" style="margin-top:8px">${rows.map(card)}</div></div>`;
  };

  const detail = () => {
    const r = R(), row = r.at(st.k), t = tone(row);
    if (!row.extra && row.extra !== 0) return h`<div class="fx-note warn"><span>⚠️</span><div><b>Extra investing alone cannot close the gap if you start in ${row.year}</b> in the ${r.scenario.name} scenario. Combine it with a later retirement age or lower retirement spending.</div></div>`;
    return h`<div class="fx-rm-h"><div class="fx-sub">${r.scenario.name} scenario · start in ${row.year} · age ${row.age}</div><div class="fx-mid" style="color:${COLOR[t]}">+${inr(row.extra)}<span class="fx-sub" style="font-size:14px"> a month, household</span></div><div class="fx-sub">${inr(row.real)} in today's money, then rising ${(r.st * 100).toFixed(1)}% a year with pay</div></div>
      <div class="fx-grid3"><div class="fx-tile"><div class="l">Invest in total</div><div class="v">${inrC(row.total)}</div><div class="s">${inrC(row.sipThen)} planned + extra</div></div>
        <div class="fx-tile"><div class="l">Of household pay</div><div class="v ${t}">${row.shareOfIncome == null ? '—' : pc(row.shareOfIncome)}</div><div class="s">pay ${inrC(row.income)}</div></div>
        <div class="fx-tile"><div class="l">Or a raise of</div><div class="v ${t}">${row.raisePct == null ? '—' : `+${pc(row.raisePct)}`}</div><div class="s">${inrC(row.extra)} a month</div></div></div>
      <div class="fx-rm-bar"><i style="width:${Math.min(1, row.shareOfIncome ?? 1) * 100}%;background:${COLOR[t]}"></i></div><div class="fx-sub">${verdict(t)}</div>
      ${who(row)}
      ${row.spendCut != null ? h`<div class="fx-note" style="margin-top:12px"><span>✂️</span><div><b>Or spend ${inr(row.spendCut)} less a month in retirement</b> (today's money) instead of investing more. That alone closes the gap in this scenario.</div></div>` : h`<div class="fx-note warn" style="margin-top:12px"><span>✂️</span><div>Cutting retirement spending alone cannot close the gap in this scenario.</div></div>`}`;
  };

  const compare = () => {
    const rows = all.map(({ scenario, R: q }) => { const row = q.at(Math.min(st.k, Math.max(0, q.maxYears))), ok = q.gap > 0 ? row.extra != null : true; return { scenario, q, row, ok }; });
    const line = (s) => s.q.gap <= 0 ? 'on course, no extra needed' : s.row.extra == null ? 'extra investing alone is not enough' : `invest +${inrC(s.row.extra)}/mo${two ? ` (${splitRow(s.row).map((p) => `${p.name} ${inrC(p.extra)}`).join(' · ')})` : ''}`;
    return h`<div class="fx-lbl" style="margin:14px 0 6px">THE SAME START IN EVERY SCENARIO</div><div class="fx-list">${rows.map((s) => h`<button type="button" class="fx-li" data-rmsc="${s.scenario.id}" style="text-align:left;align-items:flex-start;padding:10px 0;background:none;border:0;color:inherit;width:100%"><span class="fx-em">${s.scenario.icon || '•'}</span><span class="grow" style="min-width:0"><b>${s.scenario.name}${s.scenario.id === st.sc ? ' ✓' : ''}</b><div class="fx-sub">gap ${s.q.gap > 0 ? inrC(C(s.q.gap)) : 'none'} · ${line(s)}</div><div class="fx-sub">${s.q.gap > 0 && s.q.spendCut != null ? `or spend ${inrC(s.q.spendCut)}/mo less in retirement` : ''}</div></span></button>`)}</div>`;
  };

  const maxYears = () => R().maxYears;
  const head = () => h`<div class="fx-sub" style="margin-bottom:8px">Extra you must invest each month, from the start you pick, to close the gap under each scenario. Starting later costs more every month, because there is less time to grow.</div>`;
  const html = h`<div class="fx-card" id="roadmap"><div class="fx-ch"><h3>What to invest, and when</h3></div>${head()}
    <div id="rm-pick">${picker()}</div>
    <div id="rm-chart" style="margin-top:8px">${chart(chartRows(), st.k)}</div>
    <div class="fx-legend" style="margin:4px 0 10px"><span><i style="background:var(--fx-ok)"></i>Comfortable</span><span><i style="background:var(--fx-warn)"></i>A stretch</span><span><i style="background:var(--fx-bad)"></i>Heavy</span></div>
    <div class="fx-lab-r" style="margin-top:6px"><div class="fx-row fx-between"><label for="rm-sl">If I start in</label><b id="rm-lv">Today</b></div><input id="rm-sl" type="range" class="fx-slider" min="0" max="${maxYears()}" step="1" value="0" aria-label="Years until you start"><div class="fx-sl-ends"><span>Today</span><span id="rm-max">${maxYears()} yrs</span></div></div>
    <div id="rm-detail" style="margin-top:10px">${detail()}</div><div id="rm-cmp">${compare()}</div>
    <div class="fx-help" style="margin-top:8px">The extra amount is worked out by the planner itself: it is the exact monthly figure that makes the projected money equal the target, rising with pay. Pay and current SIPs are read from your inputs. The household total never changes with the split, only who carries it, and the spending split follows pay as a convention. Bar heights use a square-root scale. Nothing here changes your plan.</div></div>`;

  const mount = (root) => {
    const sl = root.querySelector('#rm-sl'); if (!sl) return;
    const paint = (full) => {
      const r = R(); if (st.k > r.maxYears) st.k = r.maxYears; sl.max = r.maxYears; sl.value = st.k; root.querySelector('#rm-max').textContent = `${r.maxYears} yrs`;
      root.querySelector('#rm-lv').textContent = lab(st.k) + (st.k ? ` · ${r.at(st.k).year}` : '');
      root.querySelector('#rm-chart').innerHTML = chart(chartRows(), st.k).s; root.querySelector('#rm-detail').innerHTML = detail().s; root.querySelector('#rm-cmp').innerHTML = compare().s;
      if (full) root.querySelector('#rm-pick').innerHTML = picker().s;
    };
    sl.addEventListener('input', () => { st.k = Number(sl.value); paint(false); });
    const card = root.querySelector('#roadmap');
    card.addEventListener('input', (e) => {
      if (e.target.id !== 'rm-split') return; st.you = Number(e.target.value);
      // only the split block changes, so the slider keeps its focus while it is dragged
      const row = R().at(st.k), box = card.querySelector('.fx-rm-who'); if (!box) return; const keep = e.target; const fresh = document.createElement('div'); fresh.innerHTML = who(row).s;
      const nu = fresh.querySelector('.fx-grid2'), old = box.querySelector('.fx-grid2'); if (nu && old) old.replaceWith(nu);
      box.querySelector('[data-rmy]').textContent = fresh.querySelector('[data-rmy]').textContent; box.querySelector('[data-rmp]').textContent = fresh.querySelector('[data-rmp]').textContent;
      box.querySelector('.fx-sl-ends span:nth-child(2)').innerHTML = fresh.querySelector('.fx-sl-ends span:nth-child(2)').innerHTML; void keep;
    });
    card.addEventListener('click', (e) => {
      const g = e.target.closest('[data-rm]'); if (g) { st.k = Number(g.dataset.rm); paint(false); return; }
      const s = e.target.closest('[data-rmsc]'); if (s) { st.sc = s.dataset.rmsc; paint(true); return; }
      if (e.target.closest('[data-rmreset]')) { st.you = null; paint(false); }
    });
  };
  return { html, mount };
}
