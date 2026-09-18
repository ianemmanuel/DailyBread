import crypto from "node:crypto"

import { ApiError } from "@/errors/ApiError"
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
  const ext = extension.replace(/^\.+/, "")
  return `${HERO_ORIGINAL_PREFIX}/${crypto.randomUUID()}${ext ? `.${ext}` : ""}`
}

/**
 * The public key for a processed square.
 *
 * `marketing/hero/<uuid>.webp`
 *
 * A fresh uuid per processed image, never a name derived from the promotion
 * id. That is what makes the object IMMUTABLE: replacing a promotion's image
 * writes a new key, so the year-long cache header is safe and no CDN purge is
 * ever needed. It also means the old object is still there to be deleted
 * deliberately rather than overwritten out from under a cached page.
 */
export function buildHeroPublicKey(): string {
  return `${HERO_PUBLIC_PREFIX}/${crypto.randomUUID()}.webp`
}

/*
 * Proves a key is one of ours before anything is done with it.
 *
 * Same job as assertOwnedProfileMediaKey: without it, "process this key" and
 * "delete this key" are read-anything and delete-anything primitives — an
 * admin could pass a payout proof's key and have its contents copied into the
 * PUBLIC bucket. That is the worst outcome available in this module, so the
 * check is exact: the expected prefix, one path segment after it, no
 * traversal, and no prefix collision.
 */
function assertKeyUnderPrefix(storageKey: unknown, prefix: string): string {
  if (typeof storageKey !== "string" || !storageKey) {
    throw new ApiError(400, "storageKey is required", "MISSING_FIELDS")
  }
  if (storageKey.includes("..") || storageKey.includes("//")) {
    throw new ApiError(400, "Invalid storage key", "INVALID_STORAGE_KEY")
  }

  const expected = `${prefix}/`
  if (!storageKey.startsWith(expected)) {
    throw new ApiError(400, "Invalid storage key", "INVALID_STORAGE_KEY")
  }

  /* Exactly one segment after the prefix. `marketing/hero-originals/a/b.jpg`
   * is refused — a nested path is not something this module ever produces. */
  const rest = storageKey.slice(expected.length)
  if (!rest || rest.includes("/")) {
    throw new ApiError(400, "Invalid storage key", "INVALID_STORAGE_KEY")
  }

  return storageKey
}

export function assertHeroOriginalKey(storageKey: unknown): string {
  return assertKeyUnderPrefix(storageKey, HERO_ORIGINAL_PREFIX)
}

export function assertHeroPublicKey(storageKey: unknown): string {
  return assertKeyUnderPrefix(storageKey, HERO_PUBLIC_PREFIX)
}

/* ── Scope resolution ──────────────────────────────────────────────────────
 *
 * A visitor sees the most specific promotion that applies to them:
 *
 *   CITY  ->  COUNTRY  ->  GLOBAL
 *
 * Someone in Perth sees Perth's promotion; with none, Australia's; with none,
 * the global default. Perth and Sydney can differ inside one country, and
 * Perth must never see Berlin's.
 *
 * This runs on the SERVER and returns one row (principle 1: the client renders
 * what it is given and never picks between candidates itself).
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
    const byScope = HERO_SCOPE_RANK[candidate.scope] - HERO_SCOPE_RANK[best.scope]
    if (byScope !== 0) return byScope < 0 ? candidate : best

    if (candidate.priority !== best.priority) {
      return candidate.priority > best.priority ? candidate : best
    }

    const candidateAt = candidate.publishedAt?.getTime() ?? 0
    const bestAt = best.publishedAt?.getTime() ?? 0
    return candidateAt > bestAt ? candidate : best
  })
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
