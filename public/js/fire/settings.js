// Screen: Plan settings. Name, Duet sync, display, export/import, tags, reset.
import { h, bind, IC, chip, head, fxNav, note, openForm, openInfo, toast, errToast, confirmSheet, undoToast } from './ui.js';
import { html } from '../core.js';
import * as FS from './store.js';
import * as X from './ctx.js';
import * as D from './duet.js';
import { defaultPlan } from './defaults.js';
import { toJSON, toCSV, toMarkdown, parseJSON, download, planFile, printPlan, readFile } from './io.js';
import { copySummary, toggleBasis } from './actions.js';
import { ago } from './format.js';
import { openApplyDuet } from './duetsync.js';

const row = (icon, title, sub, act, extra = '') => h`<button class="fx-li" data-act="${act}" ${extra}><span class="fx-ico">${icon}</span><span class="grow"><b>${title}</b><div class="fx-sub">${sub}</div></span>${IC.chev}</button>`;

export function settings(root) {
  const plan = X.getPlan(), st = plan.settings, wallets = D.hasDuet() ? D.duetWallets() : [], inv = D.hasDuet() ? [...D.investWalletIds(plan)] : [];
  const props = D.hasDuet() ? D.proposals(plan, X.today()).length : 0, snaps = FS.fs.snapshots.length;
  html(root, h`<div class="fx">${head({ kicker: 'FIRE PLANNER', title: 'Plan Settings', back: '#/fire' })}
    <div class="fx-card"><div class="fx-lbl" style="margin-bottom:8px">PLAN</div><div class="fx-list">
      ${row('✏️', plan.name, 'Rename this plan', 'rename')}
      ${row('🧭', 'Run setup again', 'Walk through the guided setup', 'wiz')}
      ${row('🏷️', 'Manage tags', 'Rename or merge investment categories', 'tags')}</div></div>
    <div class="fx-card"><div class="fx-lbl" style="margin-bottom:8px">SYNC WITH DUET</div><div class="fx-list">
      ${row('🔄', 'Use Duet numbers', props ? `${props} update${props > 1 ? 's' : ''} available` : 'Plan already matches your Duet entries', 'duet')}
      ${wallets.length ? row('👛', 'Wallets that count as investing', `${inv.length} of ${wallets.length} wallets. Transfers into them count as invested.`, 'wal') : ''}</div></div>
    <div class="fx-card"><div class="fx-lbl" style="margin-bottom:8px">DISPLAY</div><div class="fx-list">
      <div class="fx-li"><span class="fx-ico">💱</span><span class="grow"><b>Amounts shown in</b><div class="fx-sub">${st.basis === 'nominal' ? 'Future rupees (inflated)' : 'Today\'s rupees (inflation removed)'}</div></span><button class="fx-btn small ghost" data-act="basis">Switch</button></div>
      <div class="fx-li"><span class="fx-ico">🔢</span><span class="grow"><b>Lakh and crore</b><div class="fx-sub">${st.lakhCrore === false ? 'Thousands and millions' : '₹12.5L, ₹1.2Cr'}</div></span><button class="fx-toggle ${st.lakhCrore === false ? '' : 'on'}" role="switch" aria-checked="${st.lakhCrore !== false}" data-act="lc" aria-label="Lakh and crore"></button></div></div></div>
    <div class="fx-card"><div class="fx-lbl" style="margin-bottom:8px">EXPORT & IMPORT</div><div class="fx-list">
      ${row('📋', 'Copy plan summary', 'Plain text to paste into a message', 'copy')}
      ${row('📦', 'Download backup (JSON)', 'Everything, can be imported back', 'json')}
      ${row('📊', 'Download spreadsheet (CSV)', 'Income, holdings, loans, goals and more', 'csv')}
      ${row('📝', 'Download report (Markdown)', 'Readable summary with tables', 'md')}
      ${row('🖨️', 'Print or save as PDF', 'Opens your device print dialog', 'print')}
      ${row('📥', 'Import a backup (JSON)', 'Replaces this plan. A snapshot is saved first so you can go back.', 'imp')}</div><input type="file" id="fx-file" accept=".json,application/json" hidden></div>
    <div class="fx-card"><div class="fx-lbl" style="margin-bottom:8px">SHARING</div><div class="fx-sub" style="line-height:1.5">This plan belongs to your Duet household. Everyone signed in to this household sees and edits the same plan, and changes appear on both phones. ${FS.fs.lastSaved ? `Last saved ${ago(FS.fs.lastSaved)}.` : ''} ${snaps ? `${snaps} snapshot${snaps > 1 ? 's' : ''} saved.` : ''}</div></div>
    <div class="fx-card"><div class="fx-lbl" style="margin-bottom:8px">DANGER ZONE</div><button class="fx-btn danger" data-act="reset">Start a blank plan</button><div class="fx-sub" style="margin-top:8px">A snapshot of the current plan is saved first, so you can restore it from Check-in.</div></div>
    ${note('ⓘ', 'The planner gives estimates from the assumptions you set. It is not financial, tax or legal advice.')}${fxNav('overview')}</div>`);
  const file = root.querySelector('#fx-file');
  file.addEventListener('change', async () => {
    const f = file.files[0]; file.value = ''; if (!f) return;
    try {
      const next = parseJSON(await readFile(f));
      const ok = await confirmSheet('Replace this plan?', `"${next.name}" has ${next.holdings.length} holdings, ${next.incomes.length} incomes and ${next.goals.length} goals. Your current plan is saved as a snapshot first.`, 'Replace');
      if (!ok) return;
      await FS.takeSnapshot(`Before import ${X.today()}`, 'Saved automatically before importing a backup', {});
      await FS.replacePlan(next); toast('Backup imported'); location.hash = '#/fire';
    } catch (e) { errToast(e); }
  });
  bind(root, { click: {
    rename: () => openForm({ title: 'Rename plan', values: { name: plan.name }, fields: [{ name: 'name', label: 'Plan name', type: 'text', required: true, maxlength: 50 }], onSave: (v) => FS.rename(v.name.trim()) }),
    wiz: () => { location.hash = '#/fire/wizard'; }, tags: () => tagManager(), duet: () => openApplyDuet(), wal: () => walletSheet(wallets, inv),
    basis: () => toggleBasis(), lc: () => FS.edit('settings', (s) => { s.lakhCrore = s.lakhCrore === false; return s; }, { immediate: true }),
    copy: () => copySummary(), json: () => download(planFile(plan, 'json'), toJSON(plan), 'application/json'), csv: () => download(planFile(plan, 'csv'), toCSV(plan), 'text/csv'), md: () => download(planFile(plan, 'md'), toMarkdown(plan), 'text/markdown'), print: () => printPlan(),
    imp: () => file.click(),
    reset: async () => { if (!(await confirmSheet('Start a blank plan?', 'Everything in this plan is replaced with an empty one. A snapshot is saved first.', 'Start blank'))) return;
      try { await FS.takeSnapshot(`Before reset ${X.today()}`, 'Saved automatically before starting a blank plan', {}); const fresh = defaultPlan({ today: X.today(), name: plan.name }); fresh.settings.wizardDone = true; await FS.replacePlan(fresh); toast('Blank plan ready'); location.hash = '#/fire/wizard'; } catch (e) { errToast(e); } },
  } });
  void chip; void openInfo; void undoToast;
}

function walletSheet(wallets, current) {
  const on = new Set(current.map(Number));
  openForm({ title: 'Wallets that count as investing', sub: 'A transfer from another wallet into one of these counts as money invested.', values: Object.fromEntries(wallets.map((w) => [`w${w.id}`, on.has(w.id)])), fields: wallets.map((w) => ({ name: `w${w.id}`, type: 'toggle', hint: `${w.name}` })),
    onSave: (v) => FS.edit('settings', (s) => { s.investWalletIds = wallets.filter((w) => v[`w${w.id}`]).map((w) => w.id); return s; }, { immediate: true }) });
}

function tagManager() {
  const plan = X.getPlan(), count = {};
  for (const x of plan.holdings) for (const t of [x.subtype, ...(x.tags || [])].filter(Boolean)) count[t] = (count[t] || 0) + 1;
  const tags = Object.entries(count).sort((a, b) => b[1] - a[1]);
  if (!tags.length) return openInfo('Tags', h`<div class="fx-sub">No category tags in use yet. Pick a category when you add or edit a holding.</div>`);
  openForm({ title: 'Manage tags', sub: 'Rename a tag, or give two tags the same name to merge them.', values: Object.fromEntries(tags.map(([t]) => [`t_${t}`, t])), fields: tags.map(([t, n]) => ({ name: `t_${t}`, label: `${t} · ${n} holding${n > 1 ? 's' : ''}`, type: 'text', maxlength: 30 })),
    onSave: (v) => { const map = Object.fromEntries(tags.map(([t]) => [t, (v[`t_${t}`] || t).trim() || t])); FS.edit('holdings', (l) => l.map((x) => ({ ...x, subtype: x.subtype ? map[x.subtype] || x.subtype : x.subtype, tags: x.tags ? [...new Set(x.tags.map((t) => map[t] || t))] : x.tags })), { immediate: true }); toast('Tags updated'); } });
}
