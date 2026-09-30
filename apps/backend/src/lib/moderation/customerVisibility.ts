import { ProfileReviewStatus } from "@repo/db"

/*
 * Which moderation verdicts a customer may see content under.
 *
 * In lib/ because it is one rule applied to several owners' content — a vendor
 * profile (vendor), a dish (meals) — and neither module may import the other.
 *
 * ─── Why FLAGGED content is hidden ───────────────────────────────────────────
 *
 * Moderation flags are non-blocking for the VENDOR — a flagged save always
 * succeeds, which is the platform-wide stance — but flagged content is not
 * shown to customers. The schema says so for profiles ("FLAGGED … cannot be
 * published") and the vendor dashboard already tells a vendor that a flagged
 * dish is "not selling" and that editing puts it back in review. Showing it
 * would make that message a lie and would put unreviewed text and photography
 * in front of customers. So: AUTO_APPROVED and MANUALLY_APPROVED are visible,
 * FLAGGED and MANUALLY_REJECTED are not.
 */
export const CUSTOMER_VISIBLE_REVIEW_STATUSES: ProfileReviewStatus[] = [
  ProfileReviewStatus.AUTO_APPROVED,
  ProfileReviewStatus.MANUALLY_APPROVED,
]
