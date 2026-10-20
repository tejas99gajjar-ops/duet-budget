# Supabase setup (free plan)

**Never share with anyone, including Claude:** your database password and the `service_role` / secret key. The two things the app needs are the **Project URL** and the **anon (public) key**: those are designed to be public; the data is protected by the Row Level Security rules in `supabase/schema.sql`.

## Steps in Supabase
1. **Sign up** at supabase.com (GitHub or email) and choose the **Free** plan.
2. **New project** → name `duet-budget`, pick the region nearest you, set a strong **database password** (store it in your password manager; you won't need it again) → Create. Wait ~2 minutes.
3. **Authentication → Providers → Email**: keep *Email* enabled and turn **OFF "Confirm email"** (otherwise sign-up needs working SMTP; the free plan's built-in mailer is heavily rate-limited). Save.
4. **SQL Editor → New query** → paste all of `supabase/schema.sql` → **Run**. It should end with "Success. No rows returned". (It creates the tables, security rules, helper functions and turns on realtime. If you see an error, send me the message.)
5. **Database → Publications** (or Replication): `supabase_realtime` should list 9 tables (spaces, members, wallets, categories, transactions, budgets, recurring, investments, activity).
6. **Project Settings → API**: copy **Project URL** and the **anon public** key. Give those two to me.
7. **Authentication → URL Configuration**: once the app has a web address (step below), set **Site URL** to it.

## Free web hosting for the app files (GitHub Pages)
1. Create a GitHub repo (can be private only on paid plans; public is fine: it contains no secrets, the anon key is public by design) and push this `duet/` folder.
2. Repo **Settings → Pages → Build and deployment → Source: GitHub Actions**. The workflow `.github/workflows/pages.yml` publishes `public/` on every push.
3. Your address is `https://<your-username>.github.io/<repo>/`. Put it in Supabase → Authentication → URL Configuration → **Site URL**.

(Other free hosts work too: Cloudflare Pages / Netlify, publish directory `public`.)

## Background
Supabase stores data; it doesn't serve web pages. The app's `public/` folder is static. HTTPS is included on GitHub Pages, which Android needs for "Install app".

## Things that behave differently on Supabase
- **No "Add a profile" button.** Creating a login for someone else needs the secret key, which must never be in the app. Use the invite code/link instead (up to 6 people).
- **Free projects pause after about a week with no activity** (restore with one click in the dashboard). Daily use prevents it.
- **Backups:** don't rely on free-plan backups; use **Settings → Download backup (CSV)** regularly.
- Your data lives with Supabase (a third party). Row Level Security means each account only ever sees its own shared budget.

## Verified so far
`supabase/schema.sql` was run against a real Postgres engine (PGlite) with stubbed Supabase auth: members share data; an outsider sees nothing; non-owners can't remove people; a transaction can't reference another account's wallet; anonymous access is denied; recurring creation is idempotent; the activity log is written by the database. The browser-side code was also run against that schema (offline queue, RLS) and in a real browser. What has **not** been exercised is Supabase's own sign-up/login service and realtime transport: your first sign-up is that check.
