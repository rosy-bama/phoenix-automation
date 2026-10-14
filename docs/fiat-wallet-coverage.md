# Fiat Wallet - automation coverage

Source of truth: [`src/test-plan/fiat-wallet.plan.json`](../src/test-plan/fiat-wallet.plan.json),
the v2 test plan (13 Oct 2026). It is v1 (156 cases, ClickUp "Test plans > Fiat wallet")
checked against the [Figma Wallet page](https://www.figma.com/design/wupOXbtxsxrenOpL5AfM4u/Design?node-id=150-518),
plus 63 new cases. It is published as the ClickUp sub-page "Fiat wallet — v2 (Figma)"
(`npm run plan:render` prints the markdown).

Every test title starts with its plan TC ID. `tc('<id>')` adds `@smoke` and the priority tag
from the plan, and fails if the ID is not in the plan.

| Plan section | Cases | Automated | Spec |
|---|---|---|---|
| 1. Wallet Account List | 23 | 23 | `01-account-list.spec.ts` |
| 2. Account List Filters | 19 | 17 | `02-account-list-filters.spec.ts` |
| 3. Account Details | 22 | 22 | `03-account-details.spec.ts` |
| 4. Transaction Filters (account) | 12 | 12 | `04-account-transaction-filters.spec.ts` |
| 5. Transaction Details (account) | 14 | 14 | `05-account-transaction-details.spec.ts` |
| 6. Manual deposit (Cash in) | 27 | 27 | `06-manual-deposit.spec.ts` |
| 7. Manual withdrawal (Cash out) | 29 | 27 | `07-manual-withdrawal.spec.ts` |
| 8. Transactions module - list | 20 | 20 | `08-transactions-list.spec.ts` |
| 9. Transactions module - filters | 15 | 14 | `09-transactions-filters.spec.ts` |
| 10. Txn details - Deposits/Withdrawals | 14 | 12 | `10-11-transactions-details.spec.ts` |
| 11. Txn details - Sales/Purchases | 9 | 9 | `10-11-transactions-details.spec.ts` |
| 12. Complete transaction (new) | 11 | 11 | `12-complete-transaction.spec.ts` |
| 13. Wallet issue resolution (new) | 4 | 2 | `13-wallet-issues.spec.ts` |
| **Total** | **219** | **210** | |

## Report

`npm run test:fiat:report` runs the suite and `src/reporting/plan-report.ts` writes
`reports/fiat-wallet/<date>.md` (and `.json`):

- **Passed** - the app matches the expected (design) result.
- **Failed** - it does not. Includes `knownBug()` tests that still fail ("Failed (known bug)").
- **Skipped** - `unmet()`: a test requirement is missing (data, env flag, second role).
- **Blocked** - `blocked()`: a blocking bug or missing implementation stops the steps.
- **Pass rate** = Passed / (Passed + Failed + Blocked).
- The plan with its Feedback column filled (outcome + actual result for each case).

After a **complete** run (every automated case was part of it) the report is published as a
new sub-page of ClickUp "Phoenix > Test sessions > Automatic" when `CLICKUP_API_TOKEN` is set.

## Not automated

- 9 manual cases (Automate = False in the plan): product decisions (filter state across tabs,
  failed withdrawals, transfer filter), the full withdrawal that empties the shared account,
  end-date-before-start-date, reason length display, zero-balance withdrawal.
- Money-moving cases run only with `PHX_ALLOW_MONEY_OPS=true` (testbox).
- Audit trail cases are Blocked: Phoenix has no audit-trail screen.

## Defects and trend

- `src/test-plan/fiat-wallet.defects.json` is the defect register: each defect lists the test cases
  that detect it. Add the ticket id (`"ticket": "PHX-123"`) once filed.
- Each report shows **Defect trend** right after the summary (one row per session: open defects by
  severity, fixed and new since the previous session) and the **Defects** table (also at the top of
  the "Test plan with feedback" sub-page), with "Since last session": New / Still open / Reopened.
- A defect is open while any of its cases is Failed or Blocked; design (Figma) defects stay open
  until removed from the register. Failed/Blocked cases not linked to a defect are listed.
- Complete runs append to `src/test-plan/fiat-wallet.history.json`. **Commit it** after each session
  so everyone's trend continues from the same history. Report name: `Test session - Fiat wallet - DD/MM/YYYY`.
