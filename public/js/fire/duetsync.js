// "Use Duet numbers" dialog: shows what would change in the plan, lets you pick, and shows the effect on the gap.
import { h, IC, sheet, toast, errToast } from './ui.js';
import * as FS from './store.js';
import * as X from './ctx.js';
import * as D from './duet.js';
import { inr, inrC, inrF } from './format.js';
import { runPlan } from './engine.js';

export function openApplyDuet({ only } = {}) {
  const plan = X.getPlan(), today = X.today();
  let list = D.proposals(plan, today); if (only) list = list.filter((p) => p.group === only);
  if (!D.hasDuet()) return toast('Duet data is not loaded', true);
  if (!list.length) return toast('Your plan already matches Duet');
  const on = new Set(list.map((p) => p.id));
  const effect = () => { const chosen = list.filter((p) => on.has(p.id)); if (!chosen.length) return ''; const next = D.applyProposals(plan, chosen), a = X.run({}, plan).gap.amount, b = runPlan(next, { today }).gap.amount, d = b - a;
    return d === 0 ? 'No change to your gap' : d < 0 ? `Gap gets smaller by <b class="ok">${inr(-d)}</b>` : `Gap gets bigger by <b class="bad">${inr(d)}</b>`; };
  const groups = [...new Set(list.map((p) => p.group))];
  const body = () => h`<div class="fx-sheet-h"><div><h1>Use Duet numbers</h1><div class="fx-sub">Averages from your last 3 full months of Duet entries</div></div><button class="iconbtn" data-act="close" aria-label="Close">${IC.close}</button></div>
    ${groups.map((g) => h`<div><div class="fx-lbl" style="margin-bottom:6px">${g}</div><div class="fx-list">${list.filter((p) => p.group === g).map((p) => h`<button class="fx-li" data-act="tg" data-id="${p.id}" style="align-items:flex-start"><span class="fx-opt ${on.has(p.id) ? 'on' : ''}" style="padding:4px 10px">${on.has(p.id) ? '✓' : '○'}</span><span class="grow"><b>${p.label}</b><div class="fx-sub">${inrF(p.from)} → <b style="color:var(--text)">${inrF(p.to)}</b></div></span></button>`)}</div></div>`)}
    <div class="fx-note purple" id="dsum"><span>📊</span><div>${effect() || 'Select at least one change'}</div></div>
    <div class="fx-row"><button class="fx-btn ghost" data-act="close" style="flex:1">Cancel</button><button class="fx-btn" data-act="ok" style="flex:2">Apply selected</button></div>`;
  const s = sheet(body(), { click: {
    tg: (el) => { const id = el.dataset.id; on.has(id) ? on.delete(id) : on.add(id); const sh = s.el.querySelector('.sheet'), top = sh.scrollTop; sh.innerHTML = `<div class="grab"></div>${body().s}`; sh.scrollTop = top; },
    ok: () => { const chosen = list.filter((p) => on.has(p.id)); if (!chosen.length) return; try { for (const sec of ['incomes', 'spending', 'holdings']) FS.edit(sec, (v) => { const p2 = { incomes: plan.incomes, spending: plan.spending, holdings: plan.holdings }; const next = D.applyProposals({ ...plan, [sec]: v }, chosen); return next[sec]; }); s.close(); toast('Duet numbers applied'); } catch (e) { errToast(e); } },
  } });
}
