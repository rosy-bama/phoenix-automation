# Phoenix Automation

Playwright + TypeScript automation for the Ejara **Phoenix admin panel**
(`phoenix-testbox.ejaraapis.xyz`). Coverage starts with **Fiat Wallet** and a
smoke test of every module page. The same page-object pattern will then be
used for Goal Savings, Savings Box, Bond Investment and User Management.

## First run

```bash
npm install
npx playwright install chromium
cp .env.example .env          # fill in PHX_USERNAME / PHX_PASSWORD
npm run test:smoke            # fast check: login + every page opens
npm test                      # full suite
npm run report                # open the HTML report
```

`.env` is gitignored. **Never commit credentials.** This repo may be public.

## Scripts

| Command | What it runs |
|---|---|
| `npm run test:smoke` | `@smoke`: login, navigation, key Fiat Wallet checks. Run after every build. |
| `npm run test:fiat` | Full Fiat Wallet regression |
| `npm run test:known-bugs` | Only `@known-bug` tests. Run after a fix build to see what got fixed. |
| `npm run test:headed` | Same as `npm test`, with a visible browser |
| `npm run codegen` | Codegen with your saved session (no need to log in again) |
| `npm run test:fiat:report` | Full Fiat Wallet run + test-session report (local, and ClickUp when `CLICKUP_API_TOKEN` is set) |
| `npm run plan:render` | Prints the Fiat Wallet test plan (v2) as ClickUp markdown |
| `npm run test:users:report` | Full User Management run + test-session report (local, and ClickUp when `CLICKUP_API_TOKEN` is set) |
| `npm run plan:render -- user-management` | Prints the User Management test plan (v2) as ClickUp markdown |
| `npm run snapshot:users` | Read-only tour of /users to re-check selectors |

## Structure

```
src/
  pages/
    LoginPage.ts, AppShell.ts         login + OTP, sidebar, logout
    components/                       FilterPanel, DataTable, Pagination,
                                      TransactionDetailsPanel (shared by all modules)
    fiat/                             Fiat Wallet account list, details, transactions
    savings/                          Savings Box account list, manual deposit flow
  utils/                              env, otp, knownBug(), text helpers
  fixtures/test-fixtures.ts           injects page objects into tests
tests/
  auth.setup.ts                       logs in once, saves .auth/state.json
  auth/  smoke/  fiat-wallet/  savings-box/
src/test-plan/fiat-wallet.plan.json   Fiat Wallet test plan v2 (source of truth for TC IDs + expected results)
src/test-plan/user-management.plan.json  User Management test plan v2 (USR-* IDs)
tests/user-management/                User Management suite (account-changing cases gated by PHX_ALLOW_ACCOUNT_OPS)
src/reporting/                        Fiat Wallet report + ClickUp publishing
docs/fiat-wallet-coverage.md          what is automated, mapped to test plan sections
```

## Conventions

- **Page Object Model**: test files contain no raw selectors.
- **Selectors**: role + accessible name first. `CONFIRMED` in a comment means
  the selector came from the 29 Sep 2026 codegen. `INFERRED` means it still
  needs one live check.
- **Known bugs**: the test asserts the *expected* (Figma) behaviour and calls
  `knownBug(id, summary)`, which uses `test.fail()`. It stays green while the
  bug exists. When the bug is fixed, it goes red with "expected to fail". At
  that point, remove the `knownBug()` line and close the ticket.
- **Money-moving tests** (manual deposit/withdrawal) are tagged `@money` and
  only run when `PHX_ALLOW_MONEY_OPS=true`.
- **Production**: blocked in `env.ts` until dev provides a fixed test OTP.

## Test IDs

Fiat Wallet test titles start with the plan's TC ID (`TC-WALLIST-001 ...`); the
expected result shown in the report comes from `src/test-plan/fiat-wallet.plan.json`.
Use `observe()` to record what the app showed, `unmet()` when a test requirement
is missing (Skipped) and `blocked()` when a bug or missing feature stops the steps
(Blocked). See `docs/fiat-wallet-coverage.md`.
