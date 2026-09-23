/*
 * Hero-promotion priority — NAMED TIERS over a stored integer.
 *
 * WHY NOT A RAW NUMBER IN THE UI
 *
 * A free integer priority field rots predictably: somebody sets 999 "to be
 * safe", the next person sets 1000 to get above them, and within a year the
 * column encodes an argument nobody remembers instead of an intention. Every
 * mature ad/merchandising stack solves this the same way — Google Ad Manager's
 * Sponsorship / Standard / Network / House levels are the clearest public
 * example — by letting people choose a MEANING and keeping the number as an
 * implementation detail of ranking.
 *
 * The column stays `Int`, so the ordering is still a cheap indexed sort and
 * finer-grained values remain expressible later without a migration. Only the
 * vocabulary is constrained.
 *
 * WHAT THE TIERS MEAN
 *
 *   STANDARD — the ordinary hero. Specificity decides: a city promotion beats
 *              its country's, which beats the global default. Almost
 *              everything is this.
 *   FEATURED — a campaign that should outrank ordinary merchandising wherever
 *              it applies, without having to be re-uploaded per city.
 *   TAKEOVER — a platform moment (an anniversary, a launch). Outranks
 *              everything that is not also a takeover.
 *
 * The gaps between the numbers are deliberate: they leave room to slot a tier
 * in between without renumbering the rows already in the table.
 *
 * Shared by the backend and the ERP so the mapping exists ONCE. A second copy
 * is how a promotion ends up ranked differently from how it was authored.
 */

export const HeroPromotionPriority = {
  STANDARD: 0,
  FEATURED: 100,
  TAKEOVER: 500,
} as const

export type HeroPromotionPriorityTier = keyof typeof HeroPromotionPriority

/** Widest-reaching first — the order the ERP lists them in. */
export const HERO_PRIORITY_TIERS = [
  "STANDARD",
  "FEATURED",
  "TAKEOVER",
] as const satisfies readonly HeroPromotionPriorityTier[]

/**
 * A tier above STANDARD is a CAMPAIGN, and a campaign must end.
 *
 * This is the whole reason the tiers are not cosmetic. A takeover suppresses
 * every ordinary promotion on the platform, so one published in December with
 * no end date is still running in May — the failure this rule exists to make
 * impossible. Enforced on the server (`assertPriorityWindow`), mirrored in the
 * ERP form so the admin is told before they submit.
 */
export function tierRequiresEndDate(tier: HeroPromotionPriorityTier): boolean {
  return tier !== "STANDARD"
}

/**
 * The tier a stored priority belongs to.
 *
 * Banded rather than an exact match, so a row written before the tiers existed
 * — or by a future path that sets a finer-grained number — still reports a
 * sensible tier instead of throwing. Every existing row is 0 and reads back as
 * STANDARD, which is what they already behave as.
 */
export function tierForPriority(priority: number): HeroPromotionPriorityTier {
  if (priority >= HeroPromotionPriority.TAKEOVER) return "TAKEOVER"
  if (priority >= HeroPromotionPriority.FEATURED) return "FEATURED"
  return "STANDARD"
}

/** The number a tier stores. */
export function priorityForTier(tier: HeroPromotionPriorityTier): number {
  return HeroPromotionPriority[tier]
}
