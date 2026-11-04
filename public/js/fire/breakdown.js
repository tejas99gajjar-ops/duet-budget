// "How is this number worked out?" for the money you hold today (the Pots figure on the Overview and the net worth on Check-in).
// Lists every holding with its value, what it is, whether it is counted and why not, a running total, and the split by type, so the total can be checked line by line.
import { h, sheet, IC, chip, srcChip } from './ui.js';
import * as X from './ctx.js';
import * as D from './duet.js';
import { CLASS_INFO, HOLDING_KINDS } from './defaults.js';
import { holdingValue } from './engine.js';
import { inr, inrC, inrF, ago } from './format.js';

const sum = (a) => a.reduce((s, x) => s + x, 0);

/** The rows behind the total: one per holding, with the reason when it is left out. */
export function potsRows(plan, res) {
  const A = plan.assumptions, people = plan.profile.people, counted = new Map(res.model.holdings.filter((m) => !m.virtual).map((m) => [m.id, m]));
  const wallets = D.hasDuet() ? D.duetWallets() : [], invs = D.hasDuet() ? D.duetInvestments() : [];
  return plan.holdings.map((x) => {
    const m = counted.get(x.id), v = holdingValue(x);
    const reason = m ? '' : x.include === false ? 'Switched off in the plan' : x.familyHeld && !A.includeFamilyFunds ? 'Held by family, and family funds are left out (Assumptions)' : x.kind === 'property' && !A.includeHouse ? 'A house you live in is not counted (Assumptions)' : 'Not counted';
    const link = x.linkedWalletId != null ? `Duet wallet “${wallets.find((w) => w.id === x.linkedWalletId)?.name || '?'}”` : x.linkedInvestmentId != null ? `Duet portfolio “${invs.find((i) => i.id === x.linkedInvestmentId)?.symbol || '?'}”` : null;
    const how = x.units != null ? `${x.units} units × ₹${x.price ?? '?'}${x.priceAsOf ? ` (price ${ago(x.priceAsOf)})` : ''}` : link ? `value follows ${link}` : 'value you entered';
    const mix = m ? m.comps.filter((c) => c.w > 0.001).map((c) => `${CLASS_INFO[c.cls]?.short || c.cls} ${Math.round(c.w * 100)}%`).join(' · ') : '';
    return { id: x.id, name: x.name, kind: HOLDING_KINDS[x.kind] || 'Holding', owner: people.find((p) => p.id === x.owner)?.name || '', value: v, counted: !!m, reason, how, mix, family: !!x.familyHeld, invested: x.invested, comps: m?.comps || [], duet: !!link };
  }).sort((a, b) => (b.counted - a.counted) || b.value - a.value);
}

export function openPots({ title = 'Where this number comes from' } = {}) {
  const plan = X.getPlan(), res = X.run(), rows = potsRows(plan, res);
  const inList = rows.filter((r) => r.counted), out = rows.filter((r) => !r.counted), total = sum(inList.map((r) => r.value)), engine = res.projection.potsTotal;
  let run = 0; const withRun = inList.map((r) => ({ ...r, run: (run += r.value) }));
  const byClass = {}; for (const r of inList) for (const c of r.comps) byClass[c.cls] = (byClass[c.cls] || 0) + r.value * c.w;
  const classes = Object.entries(byClass).filter(([, v]) => v > 0.5).sort((a, b) => b[1] - a[1]);
  const matches = Math.abs(total - engine) < 1;
  const s = sheet(h`<div class="fx-sheet-h"><div><h1>${title}</h1><div class="fx-sub">${inList.length} holding${inList.length === 1 ? '' : 's'} added together</div></div><button class="iconbtn" data-act="close" aria-label="Close">${IC.close}</button></div>
    <div class="fx-tile" style="border:1.5px solid var(--fx)"><div class="fx-lbl">TOTAL TODAY</div><div class="fx-big" style="margin:4px 0">${inr(total)}</div><div class="fx-sub">${matches ? 'Matches the figure used everywhere in the planner' : `The planner uses ${inr(engine)}. Tell me if this differs.`}</div></div>
    <div><div class="fx-lbl" style="margin-bottom:6px">EVERY HOLDING THAT IS COUNTED</div>
      <div class="fx-list">${withRun.map((r, i) => h`<a class="fx-li" href="#/fire/inputs/assets" data-act="go" style="align-items:flex-start;padding:11px 0"><span class="fx-num" style="width:24px;height:24px;font-size:12px;border-radius:8px">${i + 1}</span><span class="grow" style="min-width:0"><b>${r.name}</b>${r.family ? chip('est', 'Family') : ''}<div class="fx-sub">${r.kind}${r.owner ? ` · ${r.owner}` : ''}${r.mix ? ` · ${r.mix}` : ''}</div><div class="fx-sub">${r.how}</div></span><span style="text-align:right;flex:none"><b>${inrF(r.value)}</b><div class="fx-sub">running ${inrC(r.run)}</div></span></a>`)}</div>
      <div class="fx-kv" style="margin-top:4px"><span><b>Total</b></span><b>${inrF(total)}</b></div></div>
    ${out.length ? h`<div><div class="fx-lbl" style="margin-bottom:6px">LEFT OUT (${out.length}) · ${inrC(sum(out.map((r) => r.value)))}</div><div class="fx-list">${out.map((r) => h`<a class="fx-li" href="#/fire/inputs/assets" data-act="go" style="align-items:flex-start;padding:11px 0"><span class="grow" style="min-width:0"><b>${r.name}</b><div class="fx-sub warn">${r.reason}</div></span><b class="muted">${inrF(r.value)}</b></a>`)}</div></div>` : ''}
    <div><div class="fx-lbl" style="margin-bottom:6px">THE SAME MONEY BY TYPE</div><div class="fx-list">${classes.map(([c, v]) => h`<div class="fx-li" style="padding:9px 0"><span class="fx-dot" style="background:${CLASS_INFO[c]?.color || '#8B97B3'};flex:none"></span><span class="grow">${CLASS_INFO[c]?.label || c}</span><b>${inrF(v)}</b><span class="fx-sub" style="width:44px;text-align:right">${total ? Math.round((v / total) * 100) : 0}%</span></div>`)}</div></div>
    <div class="fx-note"><span>ⓘ</span><div>Each value is what you entered (or the Duet wallet or price × units it follows). Mixed funds are split across types by the percentages you set. Change any value in Inputs → Assets and this total, and everything that depends on it, updates at once.</div></div>
    <div class="fx-row"><a class="fx-btn ghost" href="#/fire/inputs/assets" data-act="go" style="flex:1;text-align:center">Edit holdings</a><button class="fx-btn" data-act="close" style="flex:1">Done</button></div>`,
  { click: { go: () => s.close() } });
  return s;
}
void srcChip;
