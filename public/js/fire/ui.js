// Shared building blocks for the FIRE screens: header, cards, chips, forms in bottom sheets, undo toast.
import { h, raw, bind, sheet, toast, errToast, confirmSheet, esc } from '../core.js';
import { parseINR, inrF } from './format.js';

export { h, raw, bind, sheet, toast, errToast, confirmSheet };

const svg = (d, extra = '') => raw(`<svg viewBox="0 0 24 24" ${extra}>${d}</svg>`);
export const IC = {
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  chev: raw('<svg class="fx-chev" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>'),
  more: svg('<circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/>', 'fill="currentColor" stroke="none"'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  edit: svg('<path d="M4 20h4L19 9l-4-4L4 16v4zM13 7l4 4"/>'),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  sync: svg('<path d="M20 11a8 8 0 0 0-14-4L4 9M4 4v5h5M4 13a8 8 0 0 0 14 4l2-2M20 20v-5h-5"/>'),
  home: svg('<path d="M3 11l9-7 9 7M5 10v10h5v-6h4v6h5V10"/>'),
  target: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>'),
  grid: svg('<rect x="4" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6"/>'),
  trend: svg('<path d="M3 17l5-6 4 3 5-8 4 4"/>'),
  cal: svg('<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/>'),
  bolt: svg('<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>'),
};

export const SRC = { duet: ['duet', 'From Duet'], entered: ['entered', 'You entered'], est: ['est', 'Estimate'], def: ['def', 'Default'] };
export const srcChip = (src, extra = '') => { const [c, t] = SRC[src] || SRC.est; return h`<span class="fx-chip ${c}" ${raw(extra)}>${t}</span>`; };
export const chip = (cls, text) => h`<span class="fx-chip ${cls}">${text}</span>`;
export const statusChip = (s) => chip(s === 'ahead' ? 'ok' : s === 'on-track' ? 'ok' : 'warn', s === 'ahead' ? 'Ahead' : s === 'on-track' ? 'On track' : 'Behind');
export const tile = (l, v, s = '', cls = '') => h`<div class="fx-tile ${cls}"><div class="l">${l}</div><div class="v">${v}</div>${s ? h`<div class="s">${s}</div>` : ''}</div>`;
export const note = (icon, content, cls = '') => h`<div class="fx-note ${cls}"><span>${icon}</span><div>${content}</div></div>`;
export const bar = (frac, fill) => raw(`<div class="fx-bar thick" role="progressbar" aria-valuenow="${Math.round((frac || 0) * 100)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${Math.max(0, Math.min(100, (frac || 0) * 100))}%;${fill ? `--fill:${fill}` : ''}"></i></div>`);
export const toggle = (on, act, extra = '') => h`<button type="button" class="fx-toggle ${on ? 'on' : ''}" role="switch" aria-checked="${!!on}" data-act="${act}" ${raw(extra)}></button>`;
export const stepper = (value, act, label, extra = '') => h`<div class="fx-step"><button type="button" data-act="${act}" data-d="-1" aria-label="Decrease ${label}" ${raw(extra)}>−</button><span class="n">${value}</span><button type="button" data-act="${act}" data-d="1" aria-label="Increase ${label}" ${raw(extra)}>+</button></div>`;
export const addBtn = (act, label, extra = '') => h`<button class="fx-add" data-act="${act}" ${raw(extra)}>${IC.plus}<span>${label}</span></button>`;

export function head({ kicker, title, back, right, sub }) {
  return h`<div class="fx-head">${back ? h`<a class="fx-back" href="${back}" aria-label="Back">${IC.back}</a>` : ''}<div class="grow"><div class="fx-kick">${kicker}</div><div class="fx-title">${title}</div>${sub ? h`<div class="fx-sub">${sub}</div>` : ''}</div>${right ? h`<div class="fx-head-right">${right}</div>` : ''}</div>`;
}
export const NAV = [['overview', 'Overview', IC.home, '#/fire'], ['goals', 'Goals', IC.target, '#/fire/goals'], ['inputs', 'Inputs', IC.grid, '#/fire/inputs'], ['live', 'Live', IC.trend, '#/fire/live'], ['checkin', 'Check-in', IC.cal, '#/fire/checkin']];
export const fxNav = (active) => h`<nav class="fx-nav" aria-label="FIRE planner">${NAV.map(([id, label, icon, href]) => h`<a href="${href}" class="${id === active ? 'on' : ''}">${icon}<span>${label}</span></a>`)}</nav>`;

/** Toast with an Undo button. */
export function undoToast(message, onUndo, ms = 8000) {
  const t = document.createElement('div'); t.className = 'toast'; t.style.pointerEvents = 'auto'; t.style.display = 'flex'; t.style.gap = '14px'; t.style.alignItems = 'center';
  const span = document.createElement('span'); span.textContent = message; const b = document.createElement('button'); b.textContent = 'Undo'; b.style.cssText = 'color:var(--fx2);font-weight:800;background:none;border:0;font-size:14px';
  b.onclick = () => { t.remove(); try { onUndo(); } catch (e) { errToast(e); } };
  t.append(span, b); document.getElementById('toasts')?.append(t); setTimeout(() => t.remove(), ms);
}

// ------------------------------------------------------------------ forms in bottom sheets
const numOrNaN = (s) => { const n = Number(String(s).replace(/,/g, '')); return String(s).trim() === '' ? NaN : n; };

/**
 * openForm({title, sub, fields, values, cta, onSave, onDelete, preview})
 * fields: [{name,label,type,...}]  type: text|textarea|money|num|pct|month|date|select|chips|multi|toggle|slider|note|title|row
 * money accepts "1.85L", "2cr", "85k"; every value is converted to a number before onSave(values).
 */
export function openForm(cfg) {
  const { title, sub, fields, cta = 'Save', onSave, onDelete, deleteLabel = 'Delete', preview, extra } = cfg;
  const v = { ...(cfg.values || {}) };
  const raw0 = {};                                           // what the person typed, for number-like fields
  const flat = (fs) => fs.flatMap((f) => (f.type === 'row' ? f.fields : [f]));
  for (const f of flat(fields)) if (['money', 'num', 'pct', 'slider'].includes(f.type)) raw0[f.name] = v[f.name] == null || v[f.name] === '' ? '' : String(v[f.name]);
  let error = '';
  const visible = (f) => !f.show || f.show(v);

  const fieldHtml = (f) => {
    if (!visible(f)) return '';
    if (f.type === 'row') return h`<div class="fx-grid2">${f.fields.map(fieldHtml)}</div>`;
    if (f.type === 'note') return h`<div class="fx-help">${f.text}</div>`;
    if (f.type === 'title') return h`<div class="fx-lbl" style="margin-top:6px">${f.text}</div>`;
    const id = 'f_' + f.name, lab = f.label ? h`<label for="${id}">${f.label}${f.required ? ' *' : ''}</label>` : '';
    let control;
    switch (f.type) {
      case 'textarea': control = h`<textarea class="fx-in" id="${id}" data-f="${f.name}" rows="3" placeholder="${f.placeholder || ''}">${v[f.name] ?? ''}</textarea>`; break;
      case 'select': control = h`<select class="fx-in" id="${id}" data-f="${f.name}" data-rerender="1">${(f.options || []).map(([val, label]) => h`<option value="${val}" ${String(v[f.name] ?? '') === String(val) ? raw('selected') : ''}>${label}</option>`)}</select>`; break;
      case 'chips': control = h`<div class="fx-chips" role="group">${(f.options || []).map(([val, label]) => h`<button type="button" class="fx-opt ${String(v[f.name]) === String(val) ? 'on' : ''}" data-act="pick" data-f="${f.name}" data-v="${val}">${label}</button>`)}</div>`; break;
      case 'multi': control = h`<div class="fx-chips" role="group">${(f.options || []).map(([val, label]) => h`<button type="button" class="fx-opt ${(v[f.name] || []).includes(val) ? 'on' : ''}" data-act="multi" data-f="${f.name}" data-v="${val}">${label}</button>`)}</div>`; break;
      case 'toggle': control = h`<div class="fx-row fx-between"><span class="fx-sub" style="color:var(--text);font-size:15px">${f.hint || ''}</span>${toggle(!!v[f.name], 'tog', `data-f="${f.name}"`)}</div>`; break;
      case 'slider': control = h`<div class="fx-row"><input type="range" class="fx-slider" id="${id}" data-f="${f.name}" min="${f.min}" max="${f.max}" step="${f.step || 1}" value="${raw0[f.name] === '' ? f.min : raw0[f.name]}"><b style="min-width:5ch;text-align:right" data-live="${f.name}">${raw0[f.name] === '' ? f.min : raw0[f.name]}${f.suffix || ''}</b></div>`; break;
      case 'money': control = h`<div class="fx-pre"><b>₹</b><input id="${id}" data-f="${f.name}" inputmode="decimal" autocomplete="off" value="${raw0[f.name]}" placeholder="${f.placeholder || '0'}"></div>`; break;
      case 'pct': control = h`<div class="fx-pre"><input id="${id}" data-f="${f.name}" inputmode="decimal" autocomplete="off" value="${raw0[f.name]}" placeholder="${f.placeholder || '0'}"><span class="suf">%</span></div>`; break;
      case 'num': control = h`<div class="fx-pre"><input id="${id}" data-f="${f.name}" inputmode="decimal" autocomplete="off" value="${raw0[f.name]}" placeholder="${f.placeholder || ''}">${f.suffix ? h`<span class="suf">${f.suffix}</span>` : ''}</div>`; break;
      case 'month': control = h`<input class="fx-in" type="month" id="${id}" data-f="${f.name}" value="${v[f.name] || ''}">`; break;
      case 'date': control = h`<input class="fx-in" type="date" id="${id}" data-f="${f.name}" value="${v[f.name] || ''}">`; break;
      default: control = h`<input class="fx-in" id="${id}" data-f="${f.name}" value="${v[f.name] ?? ''}" placeholder="${f.placeholder || ''}" ${f.maxlength ? raw(`maxlength="${f.maxlength}"`) : ''} autocomplete="off">`;
    }
    return h`<div class="fx-f">${lab}${control}${f.type === 'money' ? h`<div class="fx-help" data-fmt="${f.name}">${Number.isFinite(parseINR(raw0[f.name])) && raw0[f.name] !== '' ? inrF(parseINR(raw0[f.name])) : ''}</div>` : ''}${f.help ? h`<div class="fx-help">${f.help}</div>` : ''}</div>`;
  };
  const body = () => h`<div class="fx-sheet-h"><div><h1>${title}</h1>${sub ? h`<div class="fx-sub" style="margin-top:2px">${sub}</div>` : ''}</div><button class="iconbtn" data-act="close" aria-label="Close" type="button">${IC.close}</button></div>
    <form data-act="save" class="col" style="gap:16px" novalidate>${fields.map(fieldHtml)}${preview ? h`<div id="fx-prev">${preview(v)}</div>` : ''}${extra ? extra(v) : ''}<div class="fx-err" id="fx-err" role="alert">${error}</div>
      <div class="fx-row"><button type="button" class="fx-btn ghost" data-act="close" style="flex:1">Cancel</button><button class="fx-btn" style="flex:2">${cta}</button></div>
      ${onDelete ? h`<button type="button" class="fx-btn danger" data-act="del">${deleteLabel}</button>` : ''}</form>`;

  const coerce = () => {
    const out = { ...v };
    for (const f of flat(fields)) {
      if (!visible(f)) { continue; }
      if (f.type === 'money') out[f.name] = raw0[f.name] === '' ? null : parseINR(raw0[f.name]);
      else if (f.type === 'num' || f.type === 'pct' || f.type === 'slider') out[f.name] = raw0[f.name] === '' ? null : numOrNaN(raw0[f.name]);
    }
    return out;
  };
  const validate = (o) => {
    for (const f of flat(fields)) {
      if (!visible(f) || f.type === 'note' || f.type === 'title') continue;
      const val = o[f.name]; const empty = val == null || val === '' || (Array.isArray(val) && !val.length);
      if (f.required && empty) return `${f.label || f.name} is required`;
      if (['money', 'num', 'pct', 'slider'].includes(f.type) && !empty) {
        if (!Number.isFinite(val)) return `${f.label}: enter a valid number`;
        if (f.min != null && val < f.min) return `${f.label} must be at least ${f.min}`; if (f.max != null && val > f.max) return `${f.label} must be at most ${f.max}`;
      }
    }
    return cfg.validate ? cfg.validate(o) : '';
  };
  const s = sheet(body(), {
    click: {
      pick: (el) => { v[el.dataset.f] = el.dataset.v; redraw(); },
      multi: (el) => { const a = new Set(v[el.dataset.f] || []); a.has(el.dataset.v) ? a.delete(el.dataset.v) : a.add(el.dataset.v); v[el.dataset.f] = [...a]; redraw(); },
      tog: (el) => { v[el.dataset.f] = !v[el.dataset.f]; redraw(); },
      del: async () => { s.close(); if (await confirmSheet(cfg.deleteTitle || `${deleteLabel}?`, cfg.deleteText || 'You can undo this for a few seconds.', deleteLabel.split(' ')[0])) { try { await onDelete(); } catch (e) { errToast(e); } } },
    },
    submit: { save: async () => {
      const o = coerce(); const err = validate(o); const box = s.el.querySelector('#fx-err');
      if (err) { error = err; box.textContent = err; return; }
      try { await onSave(o); s.close(); } catch (e) { error = e.message || String(e); box.textContent = error; }
    } },
  });
  const redraw = () => { const sh = s.el.querySelector('.sheet'), top = sh.scrollTop; sh.innerHTML = `<div class="grab"></div>${body().s}`; sh.scrollTop = top; };
  s.el.addEventListener('input', (e) => {
    const t = e.target, name = t.dataset?.f; if (!name) return;
    if (t.type === 'range') { raw0[name] = t.value; const l = s.el.querySelector(`[data-live="${name}"]`); const f = flat(fields).find((x) => x.name === name); if (l) l.textContent = t.value + (f?.suffix || ''); }
    else if (name in raw0) { raw0[name] = t.value; const f = s.el.querySelector(`[data-fmt="${name}"]`); if (f) { const n = parseINR(t.value); f.textContent = t.value && Number.isFinite(n) ? inrF(n) : ''; } }
    else v[name] = t.value;
    if (preview) { const el = s.el.querySelector('#fx-prev'); if (el) try { el.innerHTML = preview({ ...coerce(), ...v, ...Object.fromEntries(Object.entries(coerce())) }).s; } catch {} }
  });
  s.el.addEventListener('change', (e) => { const t = e.target; if (t.matches?.('select[data-rerender]')) { v[t.dataset.f] = t.value; redraw(); } });
  return s;
}

/** A simple "pick a number" sheet with − and + (retirement age, years, …). */
export function openNumber({ title, sub, value, min, max, step = 1, suffix = '', onSave, help }) {
  let n = value;
  const body = () => h`<div class="fx-sheet-h"><div><h1>${title}</h1>${sub ? h`<div class="fx-sub">${sub}</div>` : ''}</div><button class="iconbtn" data-act="close" aria-label="Close">${IC.close}</button></div>
    <div class="center" style="padding:10px 0"><div class="fx-step" style="justify-content:center;gap:22px"><button data-act="d" data-d="-1" aria-label="Decrease">−</button><span class="fx-big" style="min-width:3ch">${n}${suffix}</span><button data-act="d" data-d="1" aria-label="Increase">+</button></div>${help ? h`<div class="fx-sub" style="margin-top:10px">${help(n)}</div>` : ''}</div>
    <div class="fx-row"><button class="fx-btn ghost" data-act="close" style="flex:1">Cancel</button><button class="fx-btn" data-act="ok" style="flex:2">Set</button></div>`;
  const s = sheet(body(), { click: {
    d: (el) => { n = Math.max(min, Math.min(max, +(n + Number(el.dataset.d) * step).toFixed(4))); const sh = s.el.querySelector('.sheet'); sh.innerHTML = `<div class="grab"></div>${body().s}`; },
    ok: async () => { try { await onSave(n); s.close(); } catch (e) { errToast(e); } },
  } });
  return s;
}

/** A read-only information sheet. */
export function openInfo(title, content, buttons = [['Got it', null]]) {
  const s = sheet(h`<div class="fx-sheet-h"><h1>${title}</h1><button class="iconbtn" data-act="close" aria-label="Close">${IC.close}</button></div>${content}
    <div class="fx-row">${buttons.map(([label, act], i) => h`<button class="fx-btn ${i ? 'ghost' : ''}" data-act="${act || 'close'}" style="flex:1">${label}</button>`)}</div>`, {});
  return s;
}
export const uidShort = (p) => p + Math.random().toString(36).slice(2, 8);
export { esc };

/** Slim bar at the top of every planner screen: switch between the budget app and FIRE, add a transaction, jump to budget screens. */
export const fxTop = () => h`<div class="fx-top"><div class="fx-switch" role="tablist" aria-label="App section"><a href="#/dashboard" role="tab" aria-selected="false">💰 Budget</a><a href="#/fire" role="tab" aria-selected="true" class="on">🔥 FIRE</a></div><a class="fx-addtx" href="#/tx/new" aria-label="Add transaction">${IC.plus}<span>Add</span></a></div>
  <div class="fx-quick" aria-label="Budget shortcuts">${[['#/dashboard', 'Dashboard'], ['#/wallets', 'Wallets'], ['#/budgets', 'Budgets'], ['#/analytics', 'Analytics'], ['#/transactions', 'Transactions'], ['#/settings', 'Settings']].map(([href, l]) => h`<a href="${href}">${l}</a>`)}</div>`;
