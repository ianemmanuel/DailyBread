/**
 * Marketing module — the single owner of customer-facing merchandising.
 *
 * ITS OWN MODULE, NOT PART OF ADMIN, and that is the same call the project
 * already made for tax and finance. The rule is "modules own their tables"
 * (CLAUDE.md, principle 5), and the deciding fact here is WHO READS IT: a hero
 * promotion is written by admins and read by the CUSTOMER storefront. Put the
 * table in the admin module and the customer module has to import admin, which
 * is the one dependency direction the codebase refuses. Today `modules/customer`
 * imports no sibling module at all except `@/modules/tax` — the barrel, for
 * resolution only. Marketing follows that shape exactly:
 *
 *   marketing owns HeroPromotion
 *     ├── exports `marketingAdminRouter`, which the admin v1 router mounts
 *     │   (same as taxAdminRouter and financeAdminRouter)
 *     └── exports RESOLUTION ONLY to other modules — never administration
 *
 * So the customer module will call `resolveHeroPromotionFor(...)` and has no
 * way to reach publish, delete or upload. That is deliberate: the public
 * surface of a module is the part another module is allowed to depend on, and
 * administration is never that.
 *
 * Scope: this module is marketing PLACEMENT — what appears in a merchandising
 * slot and where. It is NOT discounts. A Discount is vendor-funded money with
 * redemption rules and caps and lives in the vendor module; a HeroPromotion is
 * an image, a line of copy and a link. When vendors start paying to have a
 * meal featured, that is a promotion with a funding source, and it belongs
 * here, next to the placement it buys — not in the discount engine.
 *
 * Shipped: the pure rules and their tests, the Prisma-backed service, the admin
 * router (list, read, create, update, image upload, publish, archive), the ERP
 * screens, and the customer-facing resolution the storefront hero reads.
 *
 * Not yet: vendor-funded featured placements — see the note above for where
 * they belong.
 */

export { default as marketingAdminRouter } from "./routes/admin.routes"

/*
 * The public surface for other modules: resolution only.
 *
 * `resolveHeroPromotion` is exported as the pure rule so the customer module
 * and the service agree on one definition of "which promotion wins". The SQL
 * that pre-filters candidates orders by the same columns; the pure function is
 * what makes that transcription testable (CLAUDE.md, principle 4).
 */
export { resolveHeroPromotionFor } from "./services/heroPromotion.service"

export {
  resolveHeroPromotion,
  HERO_SCOPES,
  HERO_SCOPE_RANK,
  type HeroScope,
  type HeroScopeTarget,
  type ScopedCandidate,
} from "./lib/heroPromotion.rules"
