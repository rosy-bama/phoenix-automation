import { test as base } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage';
import { AppShell } from '../pages/AppShell';
import { FiatAccountListPage } from '../pages/fiat/FiatAccountListPage';
import { FiatAccountDetailsPage } from '../pages/fiat/FiatAccountDetailsPage';
import { FiatTransactionsPage } from '../pages/fiat/FiatTransactionsPage';
import { SavingsAccountListPage } from '../pages/savings/SavingsAccountListPage';
import { ManualOperationFlow } from '../pages/savings/ManualOperationFlow';
import { restoreSessionStorage } from '../utils/session';

type Options = {
  /** Restore the saved sessionStorage. Login tests turn this off. */
  restoreSession: boolean;
};

type Fixtures = {
  loginPage: LoginPage;
  shell: AppShell;
  fiatAccounts: FiatAccountListPage;
  fiatAccountDetails: FiatAccountDetailsPage;
  fiatTransactions: FiatTransactionsPage;
  savingsAccounts: SavingsAccountListPage;
  manualOps: ManualOperationFlow;
};

export const test = base.extend<Fixtures & Options>({
  restoreSession: [true, { option: true }],
  context: async ({ context, restoreSession, baseURL }, use) => {
    if (restoreSession && baseURL) await restoreSessionStorage(context, new URL(baseURL).origin);
    await use(context);
  },
  loginPage: async ({ page }, use) => use(new LoginPage(page)),
  shell: async ({ page }, use) => use(new AppShell(page)),
  fiatAccounts: async ({ page }, use) => use(new FiatAccountListPage(page)),
  fiatAccountDetails: async ({ page }, use) => use(new FiatAccountDetailsPage(page)),
  fiatTransactions: async ({ page }, use) => use(new FiatTransactionsPage(page)),
  savingsAccounts: async ({ page }, use) => use(new SavingsAccountListPage(page)),
  manualOps: async ({ page }, use) => use(new ManualOperationFlow(page)),
});

export { expect } from '@playwright/test';