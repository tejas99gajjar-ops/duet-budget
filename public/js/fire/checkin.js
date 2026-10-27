// Screen: Check-in. Net-worth trajectory against the plan, status, and dated snapshots you can compare or restore.
import { h, bind, IC, chip, statusChip, tile, note, head, fxNav, sheet, openForm, toast, errToast, confirmSheet } from './ui.js';
import { html } from '../core.js';
import * as FS from './store.js';
import * as X from './ctx.js';
import * as D from './duet.js';
import { CLASSES } from './defaults.js';
import { holdingValue } from './engine.js';
import { lineChart } from './charts.js';
import { inr, inrC, pc, ago } from './format.js';
import { openApplyDuet } from './duetsync.js';

const sum = (a) => a.reduce((s, x) => s + x, 0);
const when = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
const netWorth = (plan) => sum(plan.holdings.filter((x) => x.include !== false && x.kind !== 'property').map(holdingValue));
export const snapSummary = () => { const plan = X.getPlan(), res = X.run(); return { netWorth: Math.round(netWorth(plan)), target: Math.round(res.gap.target), projected: Math.round(res.gap.projected), gap: Math.round(res.gap.amount), pct: res.gap.pct, status: res.gap.status, retireAge: res.meta.retireAge, takeHome: res.meta.takeHome, sip: res.meta.sipNow, date: X.today() }; };

export function checkin(root) {
  const plan = X.getPlan(), res = X.run(), snaps = FS.fs.snapshots, now = snapSummary(), last = snaps.find((s) => s.summary && s.summary.netWorth != null);
  const rows = res.projection.rows.filter((r) => r.year <= res.meta.retireYear), ys = [res.projection.potsTotal, ...rows.map((r) => sum(CLASSES.map((c) => r.classes[c] || 0)))], xs = ['Now', ...rows.map((r) => `'${String(r.year).slice(2)}`)];
  const chart = ys.length > 2 ? lineChart(ys, xs, { color: '#7C5FE6', target: res.gap.target, w: 340, h: 170 }) : null;
  const delta = (a, b) => { const d = a - b; return h`<b class="${d >= 0 ? 'ok' : 'bad'}">${d >= 0 ? '+' : '−'}${inrC(Math.abs(d))}</b>`; };
  html(root, h`<div class="fx">${head({ kicker: 'FIRE PLANNER', title: 'Check-in', sub: 'Is real progress matching the plan?', right: statusChip(res.gap.status) })}
    <div class="fx-card"><div class="fx-lbl">NET WORTH IN INVESTMENTS</div><div class="fx-big" style="font-size:clamp(28px,9vw,38px);margin:4px 0">${inr(now.netWorth)}</div>
      ${last ? h`<div class="fx-sub">Since <b style="color:var(--text)">${last.name}</b> (${when(last.created_at)}): ${delta(now.netWorth, last.summary.netWorth)} net worth · ${delta(now.projected, last.summary.projected)} projected corpus · gap ${delta(-now.gap, -last.summary.gap)}</div>` : h`<div class="fx-sub">Save a snapshot now to start tracking progress over time.</div>`}
      ${chart ? h`<div class="fx-chart" style="margin-top:12px">${chart}</div><div class="fx-legend"><span><i style="background:#7C5FE6"></i>Planned net worth (today's ₹)</span><span><i style="background:var(--fx-bad)"></i>Target</span></div>` : ''}</div>
    <div class="fx-grid2"><button class="fx-btn" data-act="snap">Save snapshot</button><button class="fx-btn ghost" data-act="rebase">Update from Duet</button></div>
    ${note('ⓘ', 'A snapshot freezes the whole plan and its key numbers today. Compare it later to see whether you moved closer to your goal, or restore it if you change your mind.', 'purple')}
    <div class="fx-lbl" style="margin:4px 0 -4px">SNAPSHOTS</div>
    ${snaps.map((s) => h`<button class="fx-card" data-act="sn" data-id="${s.id}" style="text-align:left;width:100%"><div class="fx-row fx-between" style="gap:10px"><div class="grow" style="min-width:0"><b style="font-size:18px">${s.name}</b><div class="fx-sub">${when(s.created_at)} · ${ago(s.created_at)}</div></div>${s.summary?.status ? statusChip(s.summary.status) : ''}</div>${s.summary?.projected != null ? h`<div class="fx-row fx-between fx-sub" style="margin-top:10px"><span>Projected ${inrC(s.summary.projected)}</span><span>Target ${inrC(s.summary.target)}</span><span>${pc(s.summary.pct)}</span></div>` : ''}${s.note ? h`<div class="fx-sub" style="margin-top:6px">${s.note}</div>` : ''}</button>`)}
    ${!snaps.length ? h`<div class="fx-note"><span>📭</span><div>No snapshots yet.</div></div>` : ''}${fxNav('checkin')}</div>`);
  bind(root, { click: {
    snap: () => openForm({ title: 'Save snapshot', sub: 'Freezes the plan and its key numbers as of today', values: { name: `${new Date().toLocaleString('en-IN', { month: 'short', year: 'numeric' })} check-in`, note: '' }, fields: [{ name: 'name', label: 'Name', type: 'text', required: true, maxlength: 40 }, { name: 'note', label: 'Note (optional)', type: 'textarea' }],
      onSave: async (v) => { await FS.takeSnapshot(v.name.trim(), v.note || '', snapSummary()); toast('Snapshot saved'); } }),
    rebase: () => (D.hasDuet() ? openApplyDuet({ only: 'Assets' }) : toast('Duet data is not loaded', true)),
    sn: (el) => snapSheet(el.dataset.id),
  } });
}

function snapSheet(id) {
  const s = FS.fs.snapshots.find((x) => x.id === id); if (!s) return; const now = snapSummary(), a = s.summary || {};
  const line = (l, k, fmt = inrC, good = 'high') => { if (a[k] == null) return ''; const d = now[k] - a[k], ok = good === 'high' ? d >= 0 : d <= 0; return h`<div class="fx-li"><span class="grow"><b>${l}</b></span><span style="text-align:right"><div class="fx-sub">${fmt(a[k])} → <b style="color:var(--text)">${fmt(now[k])}</b></div><b class="${d === 0 ? '' : ok ? 'ok' : 'bad'}">${d === 0 ? 'No change' : `${d > 0 ? '+' : '−'}${k === 'pct' ? pc(Math.abs(d)) : fmt(Math.abs(d))}`}</b></span></div>`; };
  const sh = sheet(h`<div class="fx-sheet-h"><div><h1>${s.name}</h1><div class="fx-sub">${when(s.created_at)}${s.note ? ` · ${s.note}` : ''}</div></div><button class="iconbtn" data-act="close" aria-label="Close">${IC.close}</button></div>
    ${a.projected != null ? h`<div class="fx-lbl">THEN → NOW</div><div class="fx-list">${line('Net worth', 'netWorth')}${line('Projected corpus', 'projected')}${line('Target corpus', 'target', inrC, 'low')}${line('Gap', 'gap', inrC, 'low')}${line('Funded', 'pct', pc)}${line('Monthly SIPs', 'sip')}${line('Take-home', 'takeHome')}</div>` : h`<div class="fx-sub">No summary was stored with this snapshot.</div>`}
    <div class="fx-row"><button class="fx-btn ghost" data-act="del" style="flex:1">Delete</button><button class="fx-btn" data-act="res" style="flex:1">Restore</button></div>`, { click: {
    del: async () => { sh.close(); if (await confirmSheet('Delete this snapshot?', 'The snapshot is removed. Your current plan is not changed.', 'Delete')) { try { await FS.deleteSnapshot(id); toast('Snapshot deleted'); } catch (e) { errToast(e); } } },
    res: async () => { sh.close(); if (!(await confirmSheet('Restore this snapshot?', 'Your current plan is saved as a new snapshot first, then replaced with this one.', 'Restore'))) return;
      try { await FS.takeSnapshot(`Before restoring ${s.name}`, 'Saved automatically', snapSummary()); await FS.restoreSnapshot(id); toast('Snapshot restored'); location.hash = '#/fire'; } catch (e) { errToast(e); } },
  } });
}
