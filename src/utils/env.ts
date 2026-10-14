import * as dotenv from 'dotenv';

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var ${name}. Copy .env.example to .env and fill it in.`);
  }
  return value;
}

export const env = {
  baseUrl: process.env.PHX_BASE_URL ?? 'https://phoenix-testbox.ejaraapis.xyz',
  username: required('PHX_USERNAME'),
  password: required('PHX_PASSWORD'),
  otp: process.env.PHX_OTP ?? '123456',
  targetEnv: (process.env.PHX_ENV ?? 'testbox') as 'testbox' | 'staging' | 'production',
  walletUsername: process.env.PHX_WALLET_USERNAME ?? 'rosetestbox',
  savingsUsername: process.env.PHX_SAVINGS_USERNAME ?? 'priscatest5',
  allowMoneyOps: process.env.PHX_ALLOW_MONEY_OPS === 'true',
  /** User Management: Confirmed account used for read-only checks. */
  umUsername: process.env.PHX_UM_USERNAME ?? 'rosetestbox',
  allowAccountOps: process.env.PHX_ALLOW_ACCOUNT_OPS === 'true',
};

if (env.targetEnv === 'production') {
  throw new Error(
    'PHX_ENV=production is not supported yet: production needs a fixed test OTP from the dev team.'
  );
}
