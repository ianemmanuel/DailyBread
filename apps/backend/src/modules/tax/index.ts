/**
 * Tax module — the single owner of consumption-tax configuration and, in
 * later phases, of tax calculation on orders.
 *
 * Its own module rather than part of finance, deliberately. Finance owns
 * payment rails: providers, routing, credentials, readiness. Tax is a
 * separate bounded context whose growth is unrelated to any of that —
 * per-line tax on orders, exempt customers, place-of-supply rules, filing
 * and reporting exports, and eventually a TaxProvider adapter interface
 * (Avalara / TaxJar / Stripe Tax) mirroring PaymentProviderAdapter.
 *
 * It owns TaxCategory, CountryTaxRate and CountryTaxConfig outright and
 * imports nothing from finance, so it can be lifted out on its own.
 *
 * Shipped: the category catalog, per-country rates, per-country tax position
 * (inclusive/exclusive, remitter, local label), and resolution for pricing.
 *
 * Not yet: tax on an order line (there is no order), exemptions, sub-national
 * rates (see the note in tax.service.ts), filing exports, tax providers.
 */

export { default as taxAdminRouter } from "./routes/admin.routes"

/*
 * The PUBLIC surface for other modules: resolution only.
 *
 * Catalog and rate administration is deliberately not exported — those are
 * admin operations and reach the service through this module's own router.
 * What another module legitimately needs is the answer to "what does a price
 * in this country mean, and what rate does this dish attract".
 */
export {
  getCountryTaxProfile,
  resolveRateBps,
  type CountryTaxProfile,
} from "./services/tax.service"
