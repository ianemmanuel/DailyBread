/*
 * How a customer is told WHICH place they are looking at.
 *
 * Every outlet payload carries two names, both public:
 *   `name`        — the outlet's own name, unique within its vendor. It is
 *                   what tells two locations of one business apart.
 *   `displayName` — the vendor's storefront name (falls back to the outlet
 *                   name when the vendor set none).
 *
 * Cards used to print `displayName` alone, so two outlets of one vendor —
 * correctly listed twice, each with its own price, hours and reach — looked
 * like duplicate rows. The rule, once, for every surface:
 *
 *   the OUTLET name leads; the business is attribution ("by …"), shown only
 *   when it adds something the outlet name does not already say.
 */
export interface OutletIdentity {
  /** The specific place — always the main identifier. */
  name  : string
  /** The parent business, or null when it would only repeat `name`. */
  vendor: string | null
}

export function outletIdentity(outlet: { name: string; displayName: string }): OutletIdentity {
  const name = outlet.name.trim()
  const vendor = outlet.displayName.trim()
  if (!name) return { name: vendor, vendor: null }
  // "Mama's Kitchen" by "Mama's Kitchen", or "Mama's Kitchen Westlands" by
  // "Mama's Kitchen", say nothing a byline would add.
  const repeats = !vendor || name.toLocaleLowerCase().includes(vendor.toLocaleLowerCase())
  return { name, vendor: repeats ? null : vendor }
}

/** "Westlands · by Mama's Kitchen" — one line, for titles and alt text. */
export function outletLabel(outlet: { name: string; displayName: string }): string {
  const { name, vendor } = outletIdentity(outlet)
  return vendor ? `${name} · by ${vendor}` : name
}
