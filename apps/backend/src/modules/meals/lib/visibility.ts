import { Prisma, MealStatus } from "@repo/db"
import { CUSTOMER_VISIBLE_REVIEW_STATUSES } from "@/lib/moderation/customerVisibility"

/*
 * Which dishes a customer may see — the meals half of marketplace visibility.
 *
 * Owned here because every condition is a fact about a MenuItem or a Meal and
 * its lifecycle. The OUTLET half (vendor live, outlet cleared, zone may trade)
 * is composed by whoever reads for customers, and embeds SELLABLE_MEAL_WHERE
 * rather than restating it. One definition, so a dish a customer can add to a
 * basket is always a dish the storefront shows.
 */

/**
 * A dish that may be shown at all.
 *
 * Note what is NOT here: Meal.isAvailable. A dish that is 86'd today is still
 * SHOWN, greyed out with a reason — exactly as Uber Eats and DoorDash do —
 * because hiding it makes a regular think the restaurant stopped selling their
 * usual. Availability is a presentation flag, not a visibility one. The cart is
 * where it becomes a refusal.
 */
export const SELLABLE_MENU_ITEM_WHERE = {
  deletedAt   : null,
  isArchived  : false,
  adminStatus : MealStatus.ACTIVE,
  reviewStatus: { in: CUSTOMER_VISIBLE_REVIEW_STATUSES },
} satisfies Prisma.MenuItemWhereInput

/** One dish AT one outlet. The outlet-level row plus its catalog entry. */
export const SELLABLE_MEAL_WHERE = {
  deletedAt  : null,
  adminStatus: MealStatus.ACTIVE,
  menuItem   : SELLABLE_MENU_ITEM_WHERE,
} satisfies Prisma.MealWhereInput
