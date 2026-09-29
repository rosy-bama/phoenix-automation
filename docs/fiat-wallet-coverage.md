# Fiat Wallet - automation coverage

Source: Fiat Wallet Test Summary Report (11 Aug 2026) and codegen recording (29 Sep 2026).
The full 156-case test plan was not available when this suite was written. TC IDs are provisional.

| Plan section | Automated | Known-bug tests | Notes |
|---|---|---|---|
| 1. Wallet Account List | 10 | 0 | tabs, search, empty state, selection, page size, open details |
| 2. Account List Filters | 9 | 4 | multi-select status, quick date ranges, Reset, Apply |
| 3. Account Details | 9 | 0 | header fields, stat cards, freeze tooltip, tabs, export |
| 4. Transaction Filters (account) | 5 | 0 | status/payment options, "Amount range" terminology |
| 5. Transaction Details (account) | 6 | 0 | all 14 fields, Client match, Total = Amount + Fees (INFERRED) |
| 6. Manual Ops - Cash In | 0 | - | needs a codegen recording of the Fiat cash-in flow |
| 7. Manual Ops - Cash Out | 0 | - | needs a codegen recording of the Fiat cash-out flow |
| 8. Transactions Module - List | 8 | 1 | tabs, columns, page size, pagination comma |
| 9. Transactions Module - Filters | 4 | 0 | |
| 10. Txn Details - Deposits/Withdrawals | 3 | 0 | |
| 11. Txn Details - Sales/Purchases | 5 | 4 | missing Client, Product mapping |

Also included: Auth (7 tests, 1 known bug: raw i18n key on reset password), Smoke navigation
(12 tests, 1 known bug: KYC Requests error page), Savings Box manual deposit (4 tests, 1 of them `@money`).

## Staying manual (for now)

- Visual and Figma-fidelity checks (spacing, colours, copy polish)
- Invalid/expired OTP blocks the action. Testbox accepts any code.
- Clipboard content after Copy (needs clipboard permissions; can be added later)
