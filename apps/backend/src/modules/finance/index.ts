/**
 * Finance module — the single owner of DailyBread's financial domain and
 * the ONLY module that will ever talk to a payment provider.
 *
 * Actor modules (admin / vendor / customer) consume finance services;
 * they never call a provider SDK directly.
 *
 * Phase 1A (shipped): platform financial-configuration FOUNDATION —
 *   - lib/money.ts        Money convention (integer minor units + currency)
 *   - lib/currency.ts     currency-code convention helpers
 *   - lib/scope.ts        finance authz guards over the existing AdminScopeContext
 *   - providers/*         capability-segregated provider CONTRACTS (no impl yet)
 *   - secrets/*           ProviderSecretsResolver abstraction (env-backed impl)
 *   - services/*          Currency reference + PaymentProvider catalog
 *   - routes/admin.routes admin API (/admin/v1/finance/{providers,currencies})
 *
 * Not yet: CountryFinancialConfig, CountryProviderAccount, vendor payout
 * account admin/onboarding, earnings, settlement, payouts, ledger,
 * reconciliation, customer collections, Flutterwave/Stripe adapters.
 */

export { default as financeAdminRouter } from "./routes/admin.routes"
export { flutterwaveWebhookRouter } from "./webhooks/flutterwave.webhook.routes"

export * as Money from "./lib/money"
export { providerSecretsResolver } from "./secrets/provider-secrets.resolver"
export {
  getProviderAdapter,
  hasProviderAdapter,
  registerProviderAdapter,
  assertAdapterCapability,
} from "./providers/provider.registry"
export { registerProviderAdapters } from "./providers/register-adapters"
export type {
  PaymentProviderAdapter,
  ProviderCallContext,
  NormalizedBank,
  NormalizedBankAccount,
} from "./providers/provider.types"
export { ProviderError, isProviderError, type ProviderErrorCategory } from "./providers/provider.errors"

/*
 * The bridge from the finance domain to a provider adapter — ask for a
 * capability for a country, get a validated adapter + bound call context.
 * Nothing in a request flow calls this yet (no checkout / payout run) — it
 * exists so the next phase's payment flow plugs straight in.
 */
export {
  resolveProviderGateway,
  getProviderGatewayStatus,
} from "./services/finance.providerGateway.service"

/*
 * Financial readiness — the ONE readiness system. Consumed by
 * admin.country.service.ts (country launch checklist + activation gate)
 * and, in later phases, by vendor payout onboarding and customer checkout.
 */
/*
 * A country's currency and its minor-unit scale — the one resolver every
 * module prices through. Fails loudly (CURRENCY_NOT_CONFIGURED) rather than
 * assume a scale.
 */
export {
  getCurrencyForCountry,
  getCurrenciesForCountries,
  clearCurrencyCache,
  type CountryCurrency,
} from "./services/finance.countryCurrency.service"

export {
  getFinancialReadiness,
  isCollectionReady,
  isPayoutReady,
  isBankVerificationReady,
  isFinanciallyReady,
  computeFinancialReadiness,
  describeFinancialReadinessReasons,
  FINANCIAL_READINESS_REASON_LABELS,
} from "./services/finance.readiness.service"
