# Duet Budget: product & technical spec

> **v1.2 architecture:** static PWA + Supabase (Auth, Postgres with Row Level Security, Realtime). The Node/SQLite server described under "Security" below is the earlier self-hosted version, kept in `server.js` / `lib/`. Budget & analytics maths now live in `public/js/domain.js` (verified equal to the old server's output); invites and ownership are enforced by SQL functions in `supabase/schema.sql`; offline writes use a device-side queue (`public/js/store.js`). "Add a profile" was dropped: creating someone else's login needs the secret key.

## Goal
A small group (you + a friend/partner/family, up to `MAX_MEMBERS`) each log in with their own account and share **one** set of wallets, budgets, transactions and portfolio. Changes appear on the other's screen immediately.

## Gap list vs. the reference designs (what was added)
| Gap in the designs | Implementation |
|---|---|
| No login / account screens | Email + password sign-up and sign-in (`scrypt`, HttpOnly session cookie) |
| No way to connect two people | Invite code + link. Sign up with it (or "Join" in Settings while your own account is empty). Account is capped at `MAX_MEMBERS` (default 6). The owner (first member) can also create a profile for someone or remove a person |
| No "who did this" | Every transaction shows the author's initial; per-person split in Analytics; Activity log |
| No real-time sync | Server-Sent Events: any change by one partner refreshes the other's screen |
| Transactions list only 3 rows | Full list with search, type/wallet/person/category filters, pagination |
| No edit for wallet/budget | Tap a wallet or budget to edit, archive or delete |
| Recurring toggle with no management | Server materialises rules; Settings → Recurring to stop one |
| Transfer shown but unspecified | Two-wallet transfer, excluded from income/expense and budgets |
| "Move Funds" duplicates "Transfer" | Replaced with a Portfolio shortcut |
| Dashboard wallet filter chip | Replaced with partner avatars (the filter had no clear semantics for a shared net worth) |
| Portfolio "Sync" implies a live market feed | No external calls; prices are entered by hand and "day change" is the move between your last two price entries. Cost basis & gain added |
| Biometric lock, Cloud backup, Language, Notifications | Not built: a web app can't offer biometrics meaningfully, the server file *is* the backup (see README), single language |
| Custom categories absent | "New" tile in the add form |
| Currency/time zone | One currency per shared account; time zone used for "today" and budget periods |
| Installable | PWA manifest, icons, service worker shell cache |

## Data model (SQLite, money as integer cents)
`users`, `sessions`, `spaces` (the shared account; currency, tz, invite code), `members` (a user belongs to exactly one space), `wallets`, `categories`, `transactions` (`expense|income|transfer`), `budgets`, `recurring`, `investments`, `activity`.
Wallet balance = initial + income − expense − transfers out + transfers in (computed, never stored).

## Analytics
Periods: day / week / month / year, each with previous-period comparison, bucketed trend (7 days / 8 weeks / 6 months+projection / 12 months), breakdown by category and person, day-of-week profile, and **all** items of the chosen kind ranked by value with share, cumulative share (Pareto: "n of N items make 80%"), % of income and % of the category's monthly budget. Week start is a shared setting (0 = Monday … 6 = Sunday).

## "Insights" are rules, not AI
`lib/domain.js → insights()`: budget ≥ 80%/over; month-end projection = spent ÷ day-of-month × days-in-month; a category up ≥ 25% vs last month; share of income kept. No model, no network.

## Rules
- Budget window: monthly = calendar month, weekly = Mon–Sun, daily = today. *Safe/day* = remaining ÷ max(1, end − today). *Rollover* carries the previous period's unspent amount (one period lookback, not cumulative). *All Time* = limit × periods elapsed since start date.
- Overall budget = sum of monthly category limits vs. all expenses (matches the reference).
- Status: ok < 80% ≤ warning ≤ 100% < over.
- Dates are wall-clock `YYYY-MM-DD` strings → no timezone drift in monthly buckets.

## Security
scrypt password hashing, 256-bit random session tokens (stored hashed), HttpOnly + SameSite=Lax cookie (`COOKIE_SECURE=1` behind HTTPS), Origin check on writes, per-IP login throttle, strict CSP (no inline scripts), all HTML output escaped by construction (`h` template), CSV export neutralises formula injection, SQL fully parameterised.
**Not done:** no email verification or password reset (it's a two-person app: use Settings → Change password; if a password is lost, reset in the DB — see README). Put it behind HTTPS before exposing it to the internet.

## Out of scope (deliberately)
Bank-feed sync, multi-currency conversion, receipts/photos, CSV import, native Android build (the PWA installs to the home screen).
