import * as S from './store.js';
import { downloadCsv, h, html, raw, get, api, bind, loadBoot, state, space, me, wallets, money, I, iconBtn, toast, confirmSheet, sheet, avatar, niceDate, initials, pref, setPref, applyTheme, DATE_FORMATS, COLORS, swatches } from './core.js';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const FALLBACK_CCY = ['USD', 'EUR', 'GBP', 'INR', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'SGD', 'AED', 'ZAR', 'BRL', 'MXN', 'SEK', 'NOK', 'NZD'];
// Option lists come from the browser's built-in ISO 4217 / IANA data (Intl), so they are complete and need no network.
const currencies = () => { const codes = Intl.supportedValuesOf?.('currency') || FALLBACK_CCY; const dn = new Intl.DisplayNames(['en'], { type: 'currency' });
  return codes.map((c) => { let n = c; try { n = dn.of(c); } catch {} return [c, n]; }).sort((a, b) => a[1].localeCompare(b[1])); };
const zones = () => ['UTC', ...(Intl.supportedValuesOf?.('timeZone') || [])].filter((z, i, a) => a.indexOf(z) === i);
const opt = (v, label, cur) => h`<option value="${v}" ${String(v) === String(cur) ? raw('selected') : ''}>${label}</option>`;
const prefRow = (icon, label, control, hint = '') => h`<div class="list-row" style="align-items:flex-start"><span class="ico" style="width:38px;height:38px;font-size:17px">${icon}</span><div class="grow"><label class="f" style="letter-spacing:0;text-transform:none;font-size:14px;color:var(--text);font-weight:600">${label}${control}</label>${hint ? h`<div class="muted small" style="margin-top:4px">${hint}</div>` : ''}</div></div>`;
const sel = (name, options, cur) => h`<select class="input" name="${name}" data-act="pref" data-name="${name}" style="padding:11px 36px 11px 14px;font-size:15px">${options}</select>`;

export async function main(root) {
  await loadBoot();
  const sp = space(), u = me(), isOwner = sp.owner_id === u.id, full = sp.members.length >= sp.max_members;
  const inviteUrl = `${location.origin}${location.pathname}#/signup?invite=${sp.invite_code}`;
  const ws = sp.week_start, weekEnd = WEEKDAYS[(ws + 6) % 7];
  html(root, h`<h1>Settings</h1>
    <a class="card row" href="#/profile" aria-label="Edit profile"><span class="avatar" style="width:64px;height:64px;font-size:22px;border-radius:20px;background:${sp.members.find((m) => m.id === u.id)?.color || 'var(--accent)'}">${initials(u.name)}</span><div class="grow"><b style="font-size:18px">${u.name}</b><div class="muted small ellipsis">${u.email}</div></div><span class="btn small ghost">Edit profile</span></a>

    <div class="card"><div class="row between" style="margin-bottom:6px"><div class="eyebrow">People on “${sp.name}”</div><span class="muted small">${sp.members.length} of ${sp.max_members}</span></div>
      ${sp.members.map((m) => h`<div class="list-row">${avatar(m)}<span class="grow"><b>${m.name}${m.id === u.id ? ' (you)' : ''}</b>${m.id === sp.owner_id ? h` <span class="tag">owner</span>` : ''}<div class="muted small">${m.email}</div></span>
        ${isOwner && m.id !== u.id ? h`<button class="iconbtn" data-act="remove" data-id="${m.id}" data-name="${m.name}" aria-label="Remove ${m.name}" style="color:var(--red)">${I.trash}</button>` : ''}</div>`)}
      ${full ? h`<div class="muted small" style="padding-top:8px">This account is full.${isOwner ? ' Remove someone to add another person.' : ''}</div>` : h`<div class="inner" style="margin-top:10px"><div class="eyebrow">Invite code</div>
        <div class="row between" style="margin:6px 0"><span class="code">${sp.invite_code}</span><button class="btn small ghost" data-act="copy" data-v="${inviteUrl}">Copy link</button></div>
        <div class="muted small">Share this link or code. Anyone who signs up with it joins this account and instantly sees everything.</div>
        <div class="row" style="margin-top:10px;flex-wrap:wrap"><button class="link" data-act="regen">New code</button></div></div>`}
      ${sp.members.length === 1 ? h`<button class="link" data-act="join" style="margin-top:10px">Already have a code? Join their account instead</button>` : ''}</div>

    <div class="card row" style="gap:12px"><span style="font-size:22px">🔄</span><div class="grow"><b>Live sync</b> <span class="pill" id="syncpill" style="margin-left:6px">${S.state.live ? '● live' : S.state.online ? 'connecting…' : 'offline'}</span>
      <div class="muted small" style="margin-top:2px">Open the app on as many phones and computers as you like. Every change is saved in the cloud and pushed to all open devices within about a second. With no signal, entries are kept on this device and sent when you're back online.</div></div></div>

    <div class="sec-title">Preferences</div><div class="card" style="padding:4px 18px">
      ${prefRow('💵', 'Currency (shared)', sel('currency', currencies().map(([c, n]) => opt(c, `${c} — ${n}`, sp.currency)), sp.currency), 'Existing amounts are not converted.')}
      ${prefRow('🕐', 'Time zone (shared)', sel('tz', zones().map((z) => opt(z, z.replace(/_/g, ' '), sp.tz)), sp.tz), 'Decides what “today” and each month mean.')}
      ${prefRow('📅', 'Week starts on (shared)', sel('week_start', WEEKDAYS.map((d, i) => opt(i, d, ws)), ws), `Your weeks run ${WEEKDAYS[ws]} → ${weekEnd}. Used by weekly budgets and weekly analytics.`)}
      ${prefRow('🗓️', 'Date format (this device)', sel('dateFmt', Object.entries(DATE_FORMATS).map(([k, v]) => opt(k, v, pref('dateFmt', 'mdy'))), pref('dateFmt', 'mdy')))}
      ${prefRow('🌓', 'Theme (this device)', sel('theme', [['system', 'Match my device'], ['dark', 'Dark'], ['light', 'Light']].map(([k, v]) => opt(k, v, pref('theme', 'system'))), pref('theme', 'system')))}
      ${prefRow('👛', 'Default wallet (this device)', sel('defaultWallet', [opt('', 'Ask me each time', pref('defaultWallet')), ...state.boot.wallets.map((w) => opt(w.id, w.name, pref('defaultWallet')))], pref('defaultWallet')))}
      <button class="list-row" data-act="rename"><span class="ico" style="width:38px;height:38px">🏷️</span><span class="grow">Account name</span><span class="muted ellipsis" style="max-width:150px">${sp.name}</span><span class="dim">${I.chev}</span></button></div>

    <div class="sec-title">Data</div><div class="card" style="padding:4px 18px">
      <button class="list-row" data-act="recurring"><span class="ico" style="width:38px;height:38px">🔁</span><span class="grow">Recurring transactions</span><span class="dim">${I.chev}</span></button>
      <button class="list-row" data-act="activity"><span class="ico" style="width:38px;height:38px">🧾</span><span class="grow">Activity log</span><span class="dim">${I.chev}</span></button>
      <button class="list-row" data-act="csv"><span class="ico" style="width:38px;height:38px">📤</span><span class="grow">Download backup (CSV)</span><span class="dim">${I.chev}</span></button>
      ${isOwner ? h`<button class="list-row" data-act="wipe"><span class="ico" style="width:38px;height:38px">🗑️</span><span class="grow neg">Delete all data</span></button>` : ''}</div>
    <button class="btn danger" data-act="logout">Sign Out</button><p class="center dim small">Duet Budget 1.2 · Supabase</p>`);

  const refresh = async () => { await loadBoot(); window.dispatchEvent(new HashChangeEvent('hashchange')); };
  const prompt = (title, fields, onSave, cta = 'Save') => { const s = sheet(h`<h1 style="font-size:20px">${title}</h1><form class="col" data-act="f">${fields}<div class="err-msg" id="err"></div><button class="btn">${cta}</button></form>`,
    { submit: { f: async (el) => { try { await onSave(Object.fromEntries(new FormData(el))); s.close(); } catch (e) { s.el.querySelector('#err').textContent = e.message; } } } }); };
  const saveSpace = async (patch, msg) => { await api('PATCH', '/space', patch); toast(msg); await refresh(); };
  bind(root, {
    change: { pref: async (el) => {
      const v = el.value, n = el.dataset.name;
      if (n === 'currency') return saveSpace({ currency: v }, `Currency set to ${v}`);
      if (n === 'tz') return saveSpace({ tz: v }, 'Time zone saved');
      if (n === 'week_start') return saveSpace({ week_start: Number(v) }, `Weeks now start on ${WEEKDAYS[Number(v)]}`);
      setPref(n, v); if (n === 'theme') applyTheme(); toast('Saved'); await refresh();
    } },
    click: {
      copy: async (el) => { try { await navigator.clipboard.writeText(el.dataset.v); toast('Invite link copied'); } catch { prompt('Copy this invite link', h`<input class="input" value="${el.dataset.v}" readonly autofocus>`, async () => {}, 'Done'); } },
      regen: async () => { if (await confirmSheet('New invite code?', 'The old code stops working.', 'Generate')) { await api('POST', '/space/invite/regenerate'); await refresh(); } },
      join: () => prompt('Join a shared account', h`<label class="f">Invite code<input class="input" name="code" autocapitalize="characters" required></label>`, async (d) => { await api('POST', '/space/join', { code: d.code }); toast('Joined!'); await refresh(); }, 'Join'),
      remove: async (el) => { if (await confirmSheet(`Remove ${el.dataset.name}?`, 'They are signed out and moved to their own empty account. Everything they added stays here.', 'Remove')) { await api('DELETE', '/space/members/' + el.dataset.id); toast('Removed'); await refresh(); } },
      rename: () => prompt('Account name', h`<label class="f">Name<input class="input" name="name" value="${sp.name}" maxlength="60" required></label>`, async (d) => { await api('PATCH', '/space', { name: d.name }); await refresh(); }),
      csv: () => downloadCsv(), recurring: () => { location.hash = '#/recurring'; }, activity: () => { location.hash = '#/activity'; },
      wipe: async () => { if (await confirmSheet('Delete all data?', 'Wallets, transactions, budgets, investments and the activity log are removed for EVERYONE on this account. Export a CSV first. This cannot be undone.', 'Delete everything')) { await api('DELETE', '/space/data'); toast('All data deleted'); await refresh(); } },
      logout: async () => { await api('POST', '/auth/logout'); state.boot = null; location.hash = '#/welcome'; },
    } });
}

export async function profile(root) {
  await loadBoot();
  const u = me(), mine = space().members.find((m) => m.id === u.id); let color = mine.color;
  html(root, h`<div class="page-head"><a class="iconbtn" href="#/settings" aria-label="Back">${I.back}</a><h1 style="font-size:20px">Edit profile</h1><span style="width:36px"></span></div>
    <form class="col" data-act="save" style="gap:16px" novalidate>
      <div class="center"><span class="avatar" id="av" style="width:84px;height:84px;font-size:30px;border-radius:26px;margin:0 auto;background:${color}">${initials(u.name)}</span></div>
      <div><div class="eyebrow" style="margin-bottom:8px">Your colour (shown next to what you add)</div>${swatches(color)}</div>
      <label class="f">Name<input class="input" name="name" value="${u.name}" maxlength="60" required></label>
      <label class="f">Email<input class="input" type="email" name="email" value="${u.email}" readonly style="opacity:.7"></label>
      <div class="card col" style="gap:12px"><div class="eyebrow">Change password</div>
        <label class="f">Current password<input class="input" type="password" name="current_password" autocomplete="current-password"></label>
        <label class="f">New password (leave empty to keep)<input class="input" type="password" name="new_password" minlength="8" autocomplete="new-password"></label></div>
      <div class="err-msg" id="err" role="alert"></div><button class="btn" id="go">Save changes</button></form>`);
  bind(root, { click: { swatch: (el) => { color = el.dataset.v; root.querySelectorAll('.swatch').forEach((b) => b.classList.toggle('on', b === el)); root.querySelector('#av').style.background = color; } },
    submit: { save: async (el) => {
      const d = Object.fromEntries(new FormData(el)), err = root.querySelector('#err'), go = root.querySelector('#go'); err.textContent = ''; go.disabled = true;
      try { await api('PATCH', '/me', { name: d.name, email: d.email, color, current_password: d.current_password, new_password: d.new_password || undefined });
        await loadBoot(); toast('Profile saved'); location.hash = '#/settings'; } catch (e) { err.textContent = e.message; go.disabled = false; } } } });
}

export async function activity(root) {
  const { items } = await get('/activity'); await loadBoot();
  html(root, h`<div class="page-head"><a class="iconbtn" href="#/settings" aria-label="Back">${I.back}</a><h1 style="font-size:20px">Activity</h1><span style="width:36px"></span></div>
    <div class="card">${items.length ? items.map((a) => h`<div class="list-row"><span class="grow">${a.text}</span><span class="muted small">${a.ts.slice(5, 16).replace('T', ' ')}</span></div>`) : h`<div class="empty">No activity yet.</div>`}</div>`);
}
export async function recurring(root) {
  const { items } = await get('/recurring'); await loadBoot();
  html(root, h`<div class="page-head"><a class="iconbtn" href="#/settings" aria-label="Back">${I.back}</a><h1 style="font-size:20px">Recurring</h1><span style="width:36px"></span></div>
    <div class="card">${items.length ? items.map((r) => h`<div class="list-row"><span class="grow"><b>${r.note || r.type}</b><div class="muted small">${r.frequency} · next ${niceDate(r.next_date)}</div></span><b class="${r.type === 'income' ? 'pos' : 'neg'}">${money(r.amount_cents)}</b><button class="iconbtn" data-act="stop" data-id="${r.id}" aria-label="Stop" style="color:var(--red)">${I.trash}</button></div>`)
      : h`<div class="empty"><span class="e">🔁</span>No recurring transactions.<br>Turn on “Recurring” when adding one.</div>`}</div>`);
  bind(root, { click: { stop: async (el) => { if (await confirmSheet('Stop repeating?', 'Past transactions stay; no new ones are created.', 'Stop')) { await api('DELETE', '/recurring/' + el.dataset.id); window.dispatchEvent(new HashChangeEvent('hashchange')); } } } });
}
