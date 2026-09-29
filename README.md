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

IDs such as `FW-2.05` follow *section.case* from the Fiat Wallet test plan.
They are provisional and should be replaced with the real TC IDs from the
plan. See `docs/fiat-wallet-coverage.md`.
