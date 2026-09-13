/*
 * How far an outlet delivers.
 *
 * Pure — no I/O. In lib/ rather than in either module because BOTH sides need
 * the identical answer and they live in modules that must not import each
 * other: the vendor module validates what a merchant types, and the customer
 * module decides who sees the outlet. Two copies of these numbers would mean a
 * merchant setting a radius the feed then ignores, which is the worst kind of
 * disagreement — silent, and only visible as missing orders.
 *
 * ─── Radius, and how it relates to zones ─────────────────────────────────────
 *
 * These are two different questions and both have to be answered:
 *
 *   ZONE   — MAY anyone sell/deliver here at all? A platform/licensing
 *            decision an admin makes by drawing polygons. Capability.
 *   RADIUS — how far does THIS outlet choose to send its own food? A merchant
 *            decision. Reach.
 *
 * A zone cannot substitute for a radius (every outlet in a zone would have
 * identical reach, so a small kitchen would be offered to the whole of
 * Nairobi), and a radius cannot substitute for a zone (a merchant would be able
 * to opt into an area the platform has not launched). Discovery requires both.
 *
 * Uber Eats and DoorDash both ultimately derive delivery range from travel
 * TIME rather than straight-line distance, which is the eventual upgrade here —
 * it needs a routing provider and real courier timings, neither of which
 * exists. A merchant-set radius is the honest version of the same idea, and it
 * is what the merchant already controls in the outlet form.
 */

/** What an outlet gets when it has not chosen. Deliberately generous enough to
 *  be useful and small enough not to promise a cross-city delivery. */
export const DEFAULT_DELIVERY_RADIUS_KM = 10

/** A merchant cannot opt into delivering across an entire metro. Above this is
 *  treated as a data-entry mistake rather than an ambition. */
export const MAX_DELIVERY_RADIUS_KM = 30

/** Below this the outlet would be invisible to almost everyone, including
 *  customers on the same street — which is never what someone means. */
export const MIN_DELIVERY_RADIUS_KM = 0.5

export interface RadiusProblem {
  code   : "NOT_A_NUMBER" | "TOO_SMALL" | "TOO_LARGE"
  message: string
}

/**
 * Validate what a merchant typed.
 *
 * Returns the value to store, or a problem to report. `null` is a legitimate
 * answer and means "use the platform default" — a merchant who has not thought
 * about it yet should not be blocked, and should not be silently pinned to
 * whatever a form defaulted to either.
 *
 * Rejects NaN explicitly. The outlet controller coerces with `Number(...)`,
 * which turns "" and "abc" into 0 and NaN respectively — both of which would
 * previously have reached Prisma.
 */
export function validateDeliveryRadiusKm(
  value: unknown,
): { ok: true; km: number | null } | { ok: false; problem: RadiusProblem } {
  if (value == null || value === "") return { ok: true, km: null }

  const km = typeof value === "number" ? value : Number(value)

  if (!Number.isFinite(km)) {
    return { ok: false, problem: {
      code: "NOT_A_NUMBER",
      message: "Delivery radius must be a number of kilometres.",
    } }
  }

  /*
   * Zero is refused rather than read as "use the default". A merchant who
   * types 0 has said something specific and wrong — that they deliver
   * nowhere — and quietly turning that into a 10 km default would be
   * inventing an answer they did not give. Leaving the field blank is how you
   * say "I have not decided".
   */
  if (km < MIN_DELIVERY_RADIUS_KM) {
    return { ok: false, problem: {
      code: "TOO_SMALL",
      message: `Delivery radius must be at least ${MIN_DELIVERY_RADIUS_KM} km. Leave it blank to use the default of ${DEFAULT_DELIVERY_RADIUS_KM} km.`,
    } }
  }

  if (km > MAX_DELIVERY_RADIUS_KM) {
    return { ok: false, problem: {
      code: "TOO_LARGE",
      message: `Delivery radius cannot be more than ${MAX_DELIVERY_RADIUS_KM} km.`,
    } }
  }

  // Stored to 100 m. A radius is a business decision, not a survey.
  return { ok: true, km: Math.round(km * 10) / 10 }
}

/**
 * The radius that ACTUALLY applies, in metres, for the discovery filter.
 *
 * Null takes the platform default. A stored value outside the bounds is
 * clamped rather than trusted: rows written before validation existed, or by
 * any future path that skips it, must not be able to widen an outlet's reach
 * beyond what the platform allows. A ceiling only enforced on the way in is not
 * a ceiling — the same rule the discount cap follows.
 */
export function effectiveRadiusMeters(deliveryRadiusKm: number | null | undefined): number {
  const raw = typeof deliveryRadiusKm === "number" && Number.isFinite(deliveryRadiusKm) && deliveryRadiusKm > 0
    ? deliveryRadiusKm
    : DEFAULT_DELIVERY_RADIUS_KM

  return Math.min(Math.max(raw, MIN_DELIVERY_RADIUS_KM), MAX_DELIVERY_RADIUS_KM) * 1000
}
