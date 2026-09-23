import {
  type HeroPromotionPriorityTier,
  tierRequiresEndDate,
} from "@repo/types/enums"

import { ApiError } from "@/errors/ApiError"
import {
  assertKeyUnderPrefix,
  buildOriginalKey,
  buildPublicKey,
} from "@/lib/images/publicImage"
import type { SquareCropSpec } from "@/lib/images/transform"

/*
 * Hero-promotion rules. Pure — no I/O, no Prisma, no sharp — so scoping,
 * key shapes and the ownership check are unit-testable on their own. Same
 * convention as vendor.profileMedia.ts and vendor.placement.ts.
 */

/*
 * THE CROP.
 *
 * The storefront hero is a SQUARE card, at most ~600 CSS px beside the copy on
 * desktop and ~512 px on a phone. Stored pixels = widest CSS size x 2; going
 * to 3x buys nothing anybody can see and costs real bytes on a phone.
 *
 * One square therefore serves every screen, which is why there is a single
 * crop here and no mobile/desktop pair: art direction only earns its keep when
 * the SHAPE differs between breakpoints. If the hero ever becomes a
 * full-bleed banner, that is when a second spec belongs here — and the record
 * would need a second key alongside it.
 */
export const HERO_CROP: SquareCropSpec = { edge: 1600, quality: 82 }

/** Where the admin's untouched upload lands. PRIVATE bucket, never served.
 *  Kept after processing so the crop can be redone without re-uploading. */
export const HERO_ORIGINAL_PREFIX = "marketing/hero-originals"

/** Where the processed square lands. PUBLIC bucket. Only ever bytes this
 *  server produced. */
export const HERO_PUBLIC_PREFIX = "marketing/hero"

/**
 * The private key an admin uploads their original to.
 *
 * `marketing/hero-originals/<uuid>.<ext>`
 *
 * No admin id in the path, unlike the vendor prefixes. There, the owner
 * segment is what proves a key belongs to the caller before a delete. A hero
 * promotion is platform content with no per-admin ownership — the guard is
 * the permission plus the prefix check below, not the path.
 */
export function buildHeroOriginalKey(extension: string): string {
  return buildOriginalKey(HERO_ORIGINAL_PREFIX, extension)
}

/**
 * The public key for a processed square.
 *
 * A fresh uuid per processed image, never a name derived from the promotion
 * id. That is what makes the object IMMUTABLE: replacing a promotion's image
 * writes a new key, so the year-long cache header is safe and no CDN purge is
 * ever needed.
 */
export function buildHeroPublicKey(): string {
  return buildPublicKey(HERO_PUBLIC_PREFIX)
}

/*
 * Proves a key is one of ours before anything is done with it.
 *
 * The rule itself lives in lib/images/publicImage.ts and is shared with every
 * other public-image caller — it is a security control, and two copies of a
 * security control is one copy that will not get the next fix. These two
 * wrappers exist so the PREFIX cannot be passed in by a caller: hero code can
 * only ever assert hero keys.
 */
export function assertHeroOriginalKey(storageKey: unknown): string {
  return assertKeyUnderPrefix(storageKey, HERO_ORIGINAL_PREFIX)
}

export function assertHeroPublicKey(storageKey: unknown): string {
  return assertKeyUnderPrefix(storageKey, HERO_PUBLIC_PREFIX)
}

/* ── Scope resolution ──────────────────────────────────────────────────────
 *
 * Two questions, answered in this order:
 *
 *   1. WHICH PROMOTIONS APPLY HERE?  Targeting/eligibility. A city promotion
 *      applies only in that city, a country one only in that country, a global
 *      one everywhere. Perth never sees Berlin's, and an unknown location
 *      matches nothing city-scoped.
 *   2. OF THOSE, WHICH WINS?  Ranking: PRIORITY first, then specificity
 *      (CITY -> COUNTRY -> GLOBAL), then newest.
 *
 * PRIORITY RANKS BEFORE SPECIFICITY, and that ordering is the whole design.
 *
 * Specificity-first is a routing rule — the same shape as CSS specificity or
 * DNS. It is exactly right for a FALLBACK ("what do we show if nothing better
 * exists") and exactly wrong for a CAMPAIGN. Under specificity-first, a
 * national anniversary could never appear in any city that happened to have an
 * ordinary promotion of its own — the busiest markets would be the only ones
 * to miss it, and the only fix would be re-uploading the campaign city by
 * city.
 *
 * Because STANDARD is 0 and every promotion authored before this existed is 0,
 * they all tie on priority and fall through to specificity. Specificity-first
 * is therefore not replaced, it becomes the DEFAULT CASE — behaviour changes
 * only when somebody deliberately raises a tier.
 *
 * The escape hatch is symmetrical: a city that must keep its own promotion
 * during a global takeover raises its own tier above it.
 *
 * The SQL pre-filter in the service orders by the SAME three columns in the
 * same order; it has to, because it also applies a LIMIT — ordering the
 * database differently from this function would let the true winner be
 * truncated away before this function ever sees it.
 *
 * This runs on the SERVER and returns one row (principle 1: the client renders
 * what it is given and never picks between candidates itself).
 *
 * ── EVERY HERO PROMOTION PROMOTES THE PLATFORM ────────────────────────────
 *
 * At all three scopes. A promotion is DailyBread speaking — a seasonal message,
 * a new-market announcement, an anniversary — never a vendor, a meal or a meal
 * plan. The scope says WHERE it is seen and nothing else; there is no second
 * axis and no notion of a subject.
 *
 * Vendor-funded featured placement is explicitly NOT part of this (explicit
 * direction): it needs its own system — inventory, pricing, billing, fair
 * rotation between vendors who all paid — and nothing here is shaped for it.
 * Deliberately unmodelled rather than half-modelled, so there is no dormant
 * column or branch to mislead the next person reading this.
 */
export const HERO_SCOPES = ["CITY", "COUNTRY", "GLOBAL"] as const
export type HeroScope = (typeof HERO_SCOPES)[number]

/** Lower is more specific. Used for both resolution and ordering in SQL. */
export const HERO_SCOPE_RANK: Record<HeroScope, number> = {
  CITY: 0,
  COUNTRY: 1,
  GLOBAL: 2,
}

export interface HeroScopeTarget {
  cityId: string | null
  countryId: string | null
}

export interface ScopedCandidate {
  scope: HeroScope
  cityId: string | null
  countryId: string | null
  /** Ties inside one scope are broken by this, newest first. */
  priority: number
  publishedAt: Date | null
}

/**
 * Picks the winning promotion from candidates the database already filtered to
 * "published, in window".
 *
 * Deliberately a pure function over a list rather than three queries: it is
 * the rule everything else is checked against, and a rule expressed as SQL
 * ordering alone is one nobody can unit-test. The query orders by the same
 * two columns; this is what proves the two agree.
 */
export function resolveHeroPromotion<T extends ScopedCandidate>(
  candidates: readonly T[],
  target: HeroScopeTarget,
): T | null {
  const applicable = candidates.filter((candidate) => {
    switch (candidate.scope) {
      case "CITY":
        /* A city promotion needs a city, and it must be THIS city. An unknown
         * visitor location matches nothing city-scoped. */
        return Boolean(candidate.cityId) && candidate.cityId === target.cityId
      case "COUNTRY":
        return Boolean(candidate.countryId) && candidate.countryId === target.countryId
      case "GLOBAL":
        return true
    }
  })

  if (applicable.length === 0) return null

  return applicable.reduce((best, candidate) => {
    /* 1. PRIORITY. A campaign outranks ordinary merchandising at any reach. */
    if (candidate.priority !== best.priority) {
      return candidate.priority > best.priority ? candidate : best
    }

    /* 2. SPECIFICITY. Equal priority means neither is a deliberate override,
     *    so the most local one wins — the fallback rule, unchanged. */
    const byScope = HERO_SCOPE_RANK[candidate.scope] - HERO_SCOPE_RANK[best.scope]
    if (byScope !== 0) return byScope < 0 ? candidate : best

    /* 3. NEWEST. Two equally-ranked promotions for the same place: the later
     *    decision is the current one. */
    const candidateAt = candidate.publishedAt?.getTime() ?? 0
    const bestAt = best.publishedAt?.getTime() ?? 0
    return candidateAt > bestAt ? candidate : best
  })
}

/**
 * A promotion ranked above STANDARD must say when it ends.
 *
 * This is the point of the tiers, not a formality. A takeover suppresses every
 * ordinary promotion on the platform, so one published for Christmas with no
 * end date is still running in May — and nothing about the system would flag
 * it, because it is behaving exactly as configured. An ordinary STANDARD hero
 * has no such blast radius and may legitimately run until it is replaced.
 *
 * Checked on write AND on publish: a draft can be edited into a takeover after
 * it was created, and publish is the moment it reaches customers.
 */
export function assertPriorityWindow(
  tier: HeroPromotionPriorityTier,
  endsAt: Date | null,
): void {
  if (tierRequiresEndDate(tier) && !endsAt) {
    throw new ApiError(
      400,
      `A ${tier.toLowerCase()} promotion must have an end date — it outranks ordinary promotions until it stops.`,
      "CAMPAIGN_NEEDS_END_DATE",
    )
  }
}

/**
 * Refuses a run window that is already over.
 *
 * Publishing something whose end date has passed is always a mistake: it can
 * never be seen, and it looks published in every list. Separate from
 * assertWindow (start-before-end) because that one is about coherence and this
 * one is about the clock.
 */
export function assertWindowNotElapsed(endsAt: Date | null, now: Date = new Date()): void {
  if (endsAt && endsAt.getTime() <= now.getTime()) {
    throw new ApiError(
      400,
      "That end date has already passed, so the promotion would never be seen.",
      "WINDOW_ELAPSED",
    )
  }
}

/**
 * The scope a promotion is being written at must agree with the ids on it.
 *
 * A CITY promotion with no city, or a GLOBAL one carrying a country, is not a
 * validation nicety — it is a row that resolution would silently never match
 * or would match too widely.
 */
export function assertScopeShape(scope: HeroScope, target: HeroScopeTarget): void {
  if (scope === "CITY" && !target.cityId) {
    throw new ApiError(400, "A city promotion needs a city.", "MISSING_FIELDS")
  }
  if (scope === "COUNTRY" && !target.countryId) {
    throw new ApiError(400, "A country promotion needs a country.", "MISSING_FIELDS")
  }
  if (scope === "COUNTRY" && target.cityId) {
    throw new ApiError(400, "A country promotion cannot also name a city.", "INVALID_SCOPE")
  }
  if (scope === "GLOBAL" && (target.cityId || target.countryId)) {
    throw new ApiError(400, "A global promotion cannot name a city or country.", "INVALID_SCOPE")
  }
}
