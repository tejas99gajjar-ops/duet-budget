# REA findings: Spendee reference

## Scope and honesty note
- **What was analysed:** the supplied design file `Spendee — Budget App Full UI` (PDF, plus the HTML and PNG exports of it). The HTML is a bundled prototype of 11 mobile screens.
- **What was *not* analysed:** the real Spendee Android APK. None was supplied, no Android device was attached (`adb devices` was empty), and the sandbox cannot fetch one. So nothing here is derived from Spendee's actual code, API or backend. Feature behaviour below is **inferred from the designs** and from the numbers in them. Everything marked *(gap)* was added by us.
- **REA usage:** the prototype's page scripts were unbundled (`__bundler/manifest` → 11 gzip+base64 HTML pages → 11 template scripts) and fed to `analyze_javascript_application` (evidence `ev_179b22fd…`, summary of parent `ev_3e2b91e2…`). Result: 13 JS files parsed, 0 parse failures, 0 Electron surface, 1 `request` relation, no storage/IPC/network model. I.e. the prototype is **static markup with React 18 UMD (CDN) and no application logic**; REA's own limits note that the semantic graph is partial (450 unknowns) and static only.

## Observed (from the screens)
| Screen | Elements |
|---|---|
| Onboarding | 4 feature cards; "Get Started Free" / "I already have an account" |
| Dashboard | header (logo, wallet filter, theme, export); net-worth hero; savings-rate pill; income/expense this month; **Active Budget Pacing**; recent transactions grouped by day with day total, tags, search, type filter; bottom nav Dashboard / Wallets / **+** / Budgets / Analytics |
| Wallets | total balance; 2×2 coloured wallet cards (Bank, Cash, Savings, Shared) with tx counts; Transfer / Move Funds / Export CSV |
| Add Wallet | name, type (4), initial balance, currency, 6 colours |
| Budgets | This Month / All Time; ring; per-category bars with "Safe: $x/day"; "Almost over budget" state |
| Add Budget | category, amount, period (Monthly/Weekly/Daily), rollover toggle, start date |
| Add Transaction | Expense / Income / Transfer; big amount; 10 category tiles; wallet; date; time; note; tags; recurring toggle |
| Transaction Detail | hero, Cleared badge, date/wallet/budget impact ("19% → 31%")/tags, note, similar transactions, edit/delete |
| Analytics | Month/YTD; Expenses/Income/Net Cash; donut by category; 4-month cashflow + projected month; largest expenses; AI insight |
| Portfolio | total value, day change, YTD %, allocation bar, holdings, add/sync |
| Settings | profile, currency, language, dark mode, notifications, biometric lock, change password, cloud backup, export, delete all data, version, sign out |

Design tokens (counted from the CSS in the 11 pages): bg `#0D1117`, card `#1C2640`, inner `#141C2E`, border `#243050`, accent `#1DDB97`, red `#F04444`, amber `#F5A623`, blue `#3B82F6`, purple `#7C5FE6`, pink `#E879A0`, muted `#8B97B3`; font Inter; 390×844 frames; cards radius 20.

## Inferred rules (verified arithmetically against the mock data)
1. **Net worth** = sum of wallet balances (3,450.00 + 185.50 + 8,200.00 + 620.00 = 12,455.50 ✔).
2. **Savings rate** = (income − expenses) / income this month ((4,550 − 1,362.60) / 4,550 = 70.05% → "70%" ✔).
3. **Safe per day** = remaining ÷ days left, where days left = days-in-month − day-of-month (Oct 20 → 11): Food 366.60/11 = 33.33 ✔, Groceries 315.80/11 = 28.71 ✔, Overall 1,037.40/11 = 94.31 ✔.
4. **Overall budget** = sum of the monthly category limits (1,300+450+400+150+100 = 2,400 ✔) measured against *all* expenses (1,362.60).
5. **Budget status**: Bills at 88% shows an amber→red bar and "Almost over budget"; we use ≥80% = warning, >100% = over.
6. Day header total on the dashboard = that day's expenses only (54.90 + 45.00 = 99.90 ✔).

## Inconsistencies in the mock (not copied)
- Budgets ring shows **60%** but the same data is **57%** on the Dashboard. We compute it.
- Analytics donut percentages (40/30/20/10) don't match the transaction amounts. We compute from data.
- "vs prior year +14%" has no derivable source; we show "spend ±x% vs prev month" instead.
- "Bank-level security / end-to-end encryption" and "AI Insights" are marketing claims that nothing in the files supports. We replaced them with honest copy (self-hosted; rule-based insights).

## Not inferable (design decisions made here)
Authentication, data model, partner linking, sync, API, storage, hosting: nothing in the files indicates how Spendee does these, so they are ours (see `docs/SPEC.md`).
