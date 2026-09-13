/**
 * Customer module — the public marketplace surface.
 *
 * Owns: the consumer identity (ConsumerAccount, ConsumerAddress), discovery,
 * the storefront and menu presentation, and cart pricing.
 *
 * Reads from other modules but writes to none of them: menus and outlets belong
 * to the vendor module, tax rates to the tax module, and this module only ever
 * resolves and presents what they own. It has no admin surface of its own.
 *
 * Shipped: Clerk signup sync, the address book, serviceability, the discovery
 * feed, storefronts and stateless cart pricing.
 *
 * Not yet: orders, checkout, payment, persisted carts, reviews, meal plans,
 * order tracking, redemption of discount caps. Each waits on the order model.
 */

export { default as customerRouter } from "./routes"

/*
 * The PUBLIC surface for other modules.
 *
 * Deliberately narrow. Nothing in here is a write, and no other module should
 * be reaching into customer internals — an order, when it exists, will read the
 * consumer through its own relation rather than through this.
 */
export { resolveCustomerLocation, getOperatingCities } from "./services/customer.geo.service"
export type { CustomerServiceability } from "./services/customer.geo.service"
