export const env = {
  paypalClientId: process.env.PAYPAL_CLIENT_ID ?? "",
  paypalClientSecret: process.env.PAYPAL_CLIENT_SECRET ?? "",
  paypalEnv: (process.env.PAYPAL_ENV ?? "sandbox") as "sandbox" | "live",
  // Optional second app for Payouts. The IN-region sandbox business account cannot send payouts,
  // so a US-region sandbox app is used for disbursement when configured. Falls back to the main app.
  paypalUsClientId: process.env.PAYPAL_US_CLIENT_ID ?? "",
  paypalUsClientSecret: process.env.PAYPAL_US_CLIENT_SECRET ?? "",
  paypalUsMerchantEmail: process.env.PAYPAL_US_MERCHANT_EMAIL ?? "",
  merchantEmail: process.env.PAYPAL_MERCHANT_EMAIL ?? "",
  buyerEmail: process.env.PAYPAL_BUYER_EMAIL ?? "",
  // Sandbox email that receives the first member's real invoices. The IN-region personal buyer cannot
  // receive USD invoices (INR_FOREIGN_CURRENCY_BLOCKED), so default to the US sandbox account when present.
  demoPayerEmail: process.env.PAYPAL_DEMO_PAYER_EMAIL ?? process.env.PAYPAL_US_MERCHANT_EMAIL ?? "",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  anthropicBaseUrl: process.env.ANTHROPIC_BASE_URL ?? "",
  anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5",
  dataDir: process.env.DATA_DIR ?? ".data",
  upstashUrl: process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL ?? "",
  upstashToken: process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN ?? "",
};

export const paypalBase =
  env.paypalEnv === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

export const hasAi = () => Boolean(env.anthropicApiKey);
export const hasPayPal = () => Boolean(env.paypalClientId && env.paypalClientSecret);
export const hasUsPayoutApp = () => Boolean(env.paypalUsClientId && env.paypalUsClientSecret);
