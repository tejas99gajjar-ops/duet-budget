import { h, html, api, bind, I, raw, toast } from './core.js';
import * as S from './store.js';

const logo = raw('<div class="logo" style="width:84px;height:84px;border-radius:26px;margin:0 auto;box-shadow:0 12px 40px color-mix(in srgb,var(--accent) 35%,transparent)"><svg viewBox="0 0 24 24" style="width:42px;height:42px"><circle cx="12" cy="12" r="8"/><path d="M12 8v4.5l3 2"/></svg></div>');

export function welcome(root) {
  const features = [['📊', 'Track Everything', 'Expenses, income, transfers and investments — together in one shared place.', 'var(--accent)'],
    ['🎯', 'Smart Budgets', 'Category limits with a safe-to-spend-per-day pace and alerts before you overspend.', 'var(--purple)'],
    ['👥', 'Built for Two', 'Connect with a partner or friend. One shared account, everyone sees every change instantly.', 'var(--amber)'],
    ['🔒', 'Yours Alone', 'Self-hosted: your data lives on your own server, not in someone else\'s cloud.', 'var(--blue)']];
  html(root, h`<div class="col" style="gap:16px;padding-top:24px">
    ${logo}<div class="center"><h1 style="font-size:40px">Duet Budget</h1><p class="muted" style="margin-top:8px">Your money, finally under control.<br>Smart budgeting for two.</p></div>
    ${features.map(([e, t, d, c]) => h`<div class="feature"><div class="fi" style="background:color-mix(in srgb,${raw(c)} 20%,transparent)">${e}</div><div><b>${t}</b><div class="muted small" style="font-size:13px;margin-top:2px">${d}</div></div></div>`)}
    <a class="btn" href="#/signup">Get Started Free</a><a class="btn ghost" href="#/login">I already have an account</a></div>`);
}

function form(root, { title, sub, fields, cta, alt, onSubmit }) {
  html(root, h`<div class="col" style="gap:16px;padding-top:20px"><a class="iconbtn" href="#/welcome" aria-label="Back">${I.back}</a>${logo}
    <div class="center"><h1>${title}</h1><p class="muted" style="margin-top:6px">${sub}</p></div>
    <form data-act="submit" class="col" novalidate>${fields}<div class="err-msg" id="err" role="alert"></div><button class="btn" id="go">${cta}</button></form>
    <p class="center muted">${alt}</p></div>`);
  const err = root.querySelector('#err'), go = root.querySelector('#go');
  bind(root, { submit: { submit: async (el) => {
    err.textContent = ''; go.disabled = true;
    try { await onSubmit(Object.fromEntries(new FormData(el))); } catch (e) { err.textContent = e.message; go.disabled = false; }
  } }, click: { toggleInvite: (el) => { const f = root.querySelector('#inv'); f.hidden = !f.hidden; if (!f.hidden) f.querySelector('input').focus(); } } });
}
const field = (label, name, type = 'text', extra = '') => h`<label class="f">${label}<input class="input" name="${name}" type="${type}" ${raw(extra)}></label>`;

export function login(root, _q, done) {
  form(root, { title: 'Welcome back', sub: 'Sign in to your shared budget', cta: 'Sign In',
    fields: h`${field('Email', 'email', 'email', 'autocomplete="email" required')}${field('Password', 'password', 'password', 'autocomplete="current-password" required')}`,
    alt: h`New here? <a class="link" href="#/signup">Create an account</a>`,
    onSubmit: async (v) => { await S.state.backend.auth.signIn(String(v.email).trim(), v.password); await done(); } });
}
export function signup(root, q, done) {
  form(root, { title: 'Create your account', sub: q.invite ? 'You were invited to a shared budget' : 'Start a shared budget, or join your partner\'s', cta: q.invite ? 'Join & Start' : 'Create Account',
    fields: h`${field('Your name', 'name', 'text', 'autocomplete="name" required maxlength="60"')}${field('Email', 'email', 'email', 'autocomplete="email" required')}${field('Password (8+ characters)', 'password', 'password', 'autocomplete="new-password" minlength="8" required')}
      ${q.invite ? '' : h`<button type="button" class="link" data-act="toggleInvite" style="text-align:left">I have an invite code</button>`}
      <div id="inv" ${q.invite ? '' : raw('hidden')}>${field('Invite code', 'invite', 'text', `value="${(q.invite || '').replace(/[^A-Za-z0-9]/g, '')}" autocapitalize="characters" maxlength="10"`)}</div>`,
    alt: h`Already have an account? <a class="link" href="#/login">Sign in</a>`,
    onSubmit: async (v) => {
      const name = String(v.name).trim(); if (!name) throw new Error('Please enter your name'); if (String(v.password).length < 8) throw new Error('Password must be at least 8 characters');
      S.state.user = await S.state.backend.auth.signUp(String(v.email).trim(), v.password, name);
      try { await joinOrCreate(name, v.invite); } catch (e) { toast('Account created, but: ' + e.message, true); }
      await done(); } });
}

const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
async function joinOrCreate(name, invite) {
  const b = S.state.backend;
  if (String(invite || '').trim()) await b.rpc('join_space', { p_code: String(invite).trim(), p_user_name: name });
  else await b.rpc('create_space', { p_name: `${name.split(' ')[0]}'s shared budget`, p_user_name: name, p_tz: tz() });
}

/** Signed in but not in a shared account yet (e.g. a bad invite code at sign-up). */
export function setup(root, _q, done) {
  const name = S.state.user.name;
  html(root, h`<div class="col" style="gap:16px;padding-top:24px"><div class="center"><h1>One more step</h1><p class="muted" style="margin-top:6px">Join your partner's account, or start a new one.</p></div>
    <form class="card col" data-act="join"><b>Join with an invite code</b><input class="input" name="code" placeholder="ABC1234" autocapitalize="characters" maxlength="10"><div class="err-msg" id="err"></div><button class="btn">Join</button></form>
    <button class="btn ghost" data-act="create">Start a new shared account</button><button class="link" data-act="out">Sign out</button></div>`);
  const err = () => root.querySelector('#err');
  bind(root, { submit: { join: async (el) => { try { await joinOrCreate(name, new FormData(el).get('code') || ''); await done(); } catch (e) { err().textContent = e.message; } } },
    click: { create: async () => { await joinOrCreate(name, ''); await done(); }, out: async () => { await S.state.backend.auth.signOut(); await S.signedOut(); location.hash = '#/welcome'; location.reload(); } } });
}

export function needsConfig(root) {
  html(root, h`<div class="col" style="gap:14px;padding-top:30px"><h1>Almost there</h1><p class="muted">This copy of Duet Budget isn't connected to Supabase yet.</p>
    <div class="card col" style="gap:8px"><b>Do this once</b><ol style="padding-left:18px;line-height:1.6"><li>Open <code>public/config.js</code></li><li>Paste your Supabase <b>Project URL</b> and <b>anon public key</b></li><li>Reload this page</li></ol>
    <p class="muted small">Full steps: docs/SUPABASE-SETUP.md. Never paste the service_role key.</p></div></div>`);
}
