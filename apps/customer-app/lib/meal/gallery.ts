/*
 * The meal gallery's rules, pure so `scripts/check-meal-selection.ts` can pin
 * them.
 *
 * ORDER IS THE SERVER'S. The backend reads `MenuItemImage` by `position` and
 * sends `images` main-first, so the gallery never sorts — a client re-order
 * would make the vendor's chosen main photo depend on something they cannot
 * see.
 */
import type { MenuImage } from "@repo/types/customer-app"

/** Every photo, main first. `image` alone is only a fallback for a payload
 *  that carries no `images` list; nothing is ever duplicated. */
export function galleryImages(meal: { image: MenuImage | null; images: readonly MenuImage[] }): MenuImage[] {
  if (meal.images.length > 0) return [...meal.images]
  return meal.image ? [meal.image] : []
}

/** Moving by `delta` wraps at both ends; a gallery of one never moves. */
export function stepIndex(current: number, delta: number, count: number): number {
  if (count <= 1) return 0
  return (((current + delta) % count) + count) % count
}

/** What a screen reader hears for a photo, and the visible counter. */
export function photoLabel(name: string, index: number, count: number): string {
  return count > 1 ? `${name}, photo ${index + 1} of ${count}` : name
}
