// Screen: Update prices. Type today's price for each unit-based holding, or paste a CSV of "name,price".
import { h, bind, IC, chip, head, fxNav, openForm, toast, errToast, note } from './ui.js';
import { html } from '../core.js';
import * as FS from './store.js';
import * as X from './ctx.js';
import { holdingValue } from './engine.js';
import { inrC, inrF, parseINR, ago } from './format.js';

let draft = {};            // holding id -> typed price

export function prices(root) {
  const plan = X.getPlan(), list = plan.holdings.filter((x) => x.units != null);
  const dirty = Object.keys(draft).filter((k) => draft[k] !== '' && Number.isFinite(parseINR(draft[k])));
  const row = (x) => { const typed = draft[x.id], p = typed !== undefined && typed !== '' ? parseINR(typed) : null, newV = p != null && Number.isFinite(p) ? Math.round(p * x.units) : null;
    const old = (Date.now() - new Date(x.priceAsOf || 0).getTime()) / 864e5 > 30;
    return h`<div class="fx-card" style="padding:14px 16px"><div class="fx-row fx-between" style="gap:10px"><div class="grow" style="min-width:0"><b>${x.name}</b><div class="fx-sub">${x.units} units · ${x.priceAsOf ? `updated ${ago(x.priceAsOf)}` : 'no price yet'} ${old ? chip('warn', 'Old') : ''}</div></div><div style="text-align:right"><b>${inrC(newV ?? holdingValue(x))}</b>${newV != null ? h`<div class="fx-sub ${newV >= holdingValue(x) ? 'ok' : 'bad'}">${newV >= holdingValue(x) ? '+' : '−'}${inrC(Math.abs(newV - holdingValue(x)))}</div>` : ''}</div></div>
      <div class="fx-pre" style="margin-top:10px"><b>₹</b><input inputmode="decimal" data-act="pxin" data-id="${x.id}" value="${typed ?? ''}" placeholder="${x.price ?? 'Price per unit'}" aria-label="Price for ${x.name}"></div></div>`; };
  html(root, h`<div class="fx">${head({ kicker: 'INPUTS · ASSETS', title: 'Update Prices', back: '#/fire/inputs/assets', sub: 'Enter today\'s price per unit. Values update as you type.' })}
    ${list.length ? list.map(row) : note('ⓘ', 'Prices apply to holdings you track by units × price. Edit a holding and choose "Units × price" to track it here. Other holdings: edit their current value directly.')}
    ${list.length ? h`<div class="fx-card ghost"><div class="fx-row fx-between"><span><b>Import from CSV</b><div class="fx-sub">Paste lines like <code>HDFC Bank, 1650.5</code></div></span><button class="fx-btn small ghost" data-act="csv">Paste</button></div></div>` : ''}
    <div class="fx-sticky"><button class="fx-btn" data-act="save" ${dirty.length ? '' : 'disabled'}>${dirty.length ? `Save ${dirty.length} price${dirty.length > 1 ? 's' : ''}` : 'Nothing to save yet'}</button></div>${fxNav('inputs')}</div>`);
  const redrawKeep = (id) => { X.redraw(); setTimeout(() => { const el = document.querySelector(`[data-id="${id}"]`); el?.focus(); const n = el?.value.length || 0; el?.setSelectionRange?.(n, n); }, 30); };
  root.addEventListener('change', (e) => { const t = e.target; if (t.dataset?.act === 'pxin') { draft[t.dataset.id] = t.value.trim(); redrawKeep(null); } });
  bind(root, { click: {
    save: () => { const px = Object.fromEntries(dirty.map((k) => [k, parseINR(draft[k])])); const on = X.today();
      FS.edit('holdings', (l) => l.map((x) => (px[x.id] != null ? { ...x, price: px[x.id], priceAsOf: on, value: Math.round(px[x.id] * (Number(x.units) || 0)) } : x)), { immediate: true }); draft = {}; toast(`${dirty.length} price${dirty.length > 1 ? 's' : ''} updated`); },
    csv: () => openForm({ title: 'Import prices', sub: 'One per line: name, price. Names are matched to your holdings.', fields: [{ name: 'text', label: 'Prices', type: 'textarea', required: true, placeholder: 'HDFC Bank, 1650.5\nITC, 432' }], values: { text: '' }, cta: 'Match prices',
      onSave: (v) => { let hit = 0, miss = []; for (const line of v.text.split(/\n/)) { const m = line.split(/[,\t;]/).map((s) => s.trim()); if (m.length < 2 || !m[0]) continue; const price = parseINR(m[m.length - 1]); const x = list.find((q) => q.name.toLowerCase() === m[0].toLowerCase() || (q.symbol || '').toLowerCase() === m[0].toLowerCase());
        if (x && Number.isFinite(price)) { draft[x.id] = String(price); hit++; } else miss.push(m[0]); }
        toast(`${hit} matched${miss.length ? `, ${miss.length} not found (${miss.slice(0, 2).join(', ')}${miss.length > 2 ? '…' : ''})` : ''}`, !hit); X.redraw(); } }),
  } });
  void IC; void errToast; void inrF;
}
