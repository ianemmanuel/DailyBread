import { ApiError } from "@/middleware/error"
import { assertOwnedStagedKey, mealUploadPrefix } from "./images.rules"

/*
 * Menu rules — pure, no I/O, no Prisma (principle 8).
 *
 * A Menu is ONE outlet's named, branded selection of the meals that outlet
 * already sells. Everything here decides whether a submitted menu is valid;
 * where it is stored and who owns it is menus.service.ts.
 */

export const MAX_MENU_NAME_LENGTH        = 60
export const MAX_MENU_DESCRIPTION_LENGTH = 300
/** Generous — a whole outlet's menu — but bounded, so one request cannot
 *  write an unbounded join. */
export const MAX_MENU_MEALS              = 300

// ─── The logo's keys ──────────────────────────────────────────────────────────

/*
 * A menu logo is uploaded through the SAME staging prefix as a dish photo
 * (meal-uploads/<vendorId>/ — one presign endpoint, one R2 lifecycle rule that
 * expires anything never saved) and is then kept under its OWN permanent
 * prefixes, so a menu's objects and a dish's can never be confused:
 *
 *   private original   menu-images/<vendorId>/<uuid>.<ext>
 *   public master      menus/<uuid>.webp
 *
 * The vendor id segment is load-bearing, exactly as for meal images: it is
 * what makes "is this key yours" a prefix check.
 */
export const menuOriginalPrefix = (vendorId: string) => `menu-images/${vendorId}`
export const MENU_PUBLIC_PREFIX = "menus"

/** The permanent private key for a staged logo upload. */
export function menuOriginalKeyForStaged(stagedKey: string, vendorId: string): string {
  const fileName = stagedKey.slice(`${mealUploadPrefix(vendorId)}/`.length)
  return `${menuOriginalPrefix(vendorId)}/${fileName}`
}

// ─── Text ─────────────────────────────────────────────────────────────────────

export function assertMenuName(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ApiError(400, "Give the menu a name.", "MISSING_FIELDS")
  }
  const name = value.trim().replace(/\s+/g, " ")
  if (name.length > MAX_MENU_NAME_LENGTH) {
    throw new ApiError(400, `Keep the menu name under ${MAX_MENU_NAME_LENGTH} characters.`, "INVALID_NAME")
  }
  return name
}

// ─── The logo ─────────────────────────────────────────────────────────────────

export type LogoPlan =
  | { kind: "keep" }
  | { kind: "staged"; stagedKey: string }

/**
 * What a save does with the logo.
 *
 * A menu MUST have one, so on create (no current logo) the submission must be
 * a fresh staged upload of the caller's own. On update the form sends back the
 * current logo's ORIGINAL key to mean "keep it" (the same convention dish
 * photos use) or omits the field; anything else must be the caller's own
 * staged upload. Another vendor's key — staged or saved — is refused by the
 * prefix check, so a forged key can never attach someone else's object.
 */
export function planMenuLogo(
  submitted         : unknown,
  vendorId          : string,
  currentOriginalKey: string | null,
): LogoPlan {
  if (currentOriginalKey !== null && (submitted === undefined || submitted === currentOriginalKey)) {
    return { kind: "keep" }
  }
  if (submitted === undefined || submitted === null || submitted === "") {
    throw new ApiError(400, "A menu needs an image or logo.", "MISSING_IMAGE")
  }
  return { kind: "staged", stagedKey: assertOwnedStagedKey(submitted, vendorId) }
}

// ─── The meals ────────────────────────────────────────────────────────────────

/**
 * Which of the outlet's meals the menu lists, de-duplicated, in the order sent.
 *
 * `outletMealIds` is the set of the OUTLET's live meals — built server-side
 * from the outlet the menu belongs to. An id outside it (another outlet's
 * meal, another vendor's, a deleted one, or one that never existed) is
 * refused as not found and never distinguished from the others (principle 6).
 * An empty list is allowed: a menu can be set up before its dishes are.
 */
export function resolveMenuMealIds(raw: unknown, outletMealIds: ReadonlySet<string>): string[] {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw) || raw.some((id) => typeof id !== "string")) {
    throw new ApiError(400, "Meals must be a list of meal ids.", "INVALID_FIELD")
  }
  const ids = [...new Set(raw as string[])]
  if (ids.length > MAX_MENU_MEALS) {
    throw new ApiError(400, `A menu can list up to ${MAX_MENU_MEALS} meals.`, "TOO_MANY_MEALS")
  }
  if (ids.some((id) => !outletMealIds.has(id))) {
    throw new ApiError(404, "One of those meals doesn't exist at this location.", "MEAL_NOT_FOUND")
  }
  return ids
}
