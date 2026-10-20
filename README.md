# Duet Budget

A Spendee-style budget & cashflow app for **a small group (default 6 people) sharing one account**.
Static installable web app (PWA) + **Supabase** (free Postgres, logins, realtime). No server of your own to run.

- Setup: [`docs/SUPABASE-SETUP.md`](docs/SUPABASE-SETUP.md) · Design analysis: [`docs/REA-findings.md`](docs/REA-findings.md) · Spec: [`docs/SPEC.md`](docs/SPEC.md)

## How it works
```
phone / laptop ──(HTML, JS: GitHub Pages, free)──► the app
        └──(HTTPS + WebSocket)──► Supabase: Auth · Postgres (Row Level Security) · Realtime
```
- Each person signs in with their own email + password; all of you read/write the **same** wallets, budgets and transactions.
- **Live sync:** any change is pushed to every open device within about a second (Supabase Realtime).
- **Offline:** the last-seen data is cached on the device and the app opens without signal. Transactions you add, edit or delete offline are kept on the device and sent automatically when you're back online (an amber bar shows "Offline · N changes saved on this device"). Wallet / budget / settings changes need a connection.
- **Smart tips are plain rules, not AI**: no LLM, no ML model.

## Quick start
1. Do the Supabase steps in `docs/SUPABASE-SETUP.md` (create project, turn off "Confirm email", run `supabase/schema.sql`).
2. Put your **Project URL** and **anon public key** in `public/config.js`.
3. Try it locally: `npm start` → http://localhost:3000
4. Publish free on GitHub Pages: create a GitHub repo, push this folder, then **Settings → Pages → Source: GitHub Actions**. The included workflow (`.github/workflows/pages.yml`) publishes `public/`. Your address will be `https://<you>.github.io/<repo>/`; set it as **Site URL** in Supabase → Authentication → URL Configuration.
5. On Android Chrome open that address → menu → **Install app**.

## Connect your friend
Settings → **People** shows an invite code and a **Copy link** button. They open the link (or sign up and type the code) and share everything. The first person is the owner and can remove others.

## Tests
`npm test` runs 25 tests: the SQL schema and its security rules in a real Postgres engine (PGlite), the browser-side API against that schema (including the offline queue), and a comparison with the original SQLite server for identical data. `npm run schema:check` runs extra security assertions. `node test/harness/serve.mjs` serves the real UI on an in-browser Postgres at http://localhost:3300 (no Supabase needed).

## Layout
```
public/        the whole app (this folder is what gets published)
  config.js    your Supabase URL + anon key (public by design)
  js/          core, auth, tx, money, analytics, settings, charts, app
               domain.js (all budget/analytics maths) · store.js (cache, offline queue, realtime) · local-api.js · backend.js (Supabase adapter)
supabase/      schema.sql (tables, security rules, functions) + schema.check.mjs
test/          node:test suites + browser harness
server.js, lib/  the previous self-hosted Node/SQLite version (kept for reference; `npm run legacy:server`)
```

## Limits
One currency per shared account (no conversion) · investment prices are typed in by hand · no bank sync · email address can't be changed in-app · no push notifications · free Supabase projects pause after ~1 week with no activity (restore in the dashboard) · use **Settings → Download backup (CSV)** now and then.
