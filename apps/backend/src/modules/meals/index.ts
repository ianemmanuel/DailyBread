/**
 * Meals module — the single owner of the dish catalog.
 *
 * Owns MenuItem, Meal, MenuSection, ModifierGroup, ModifierOption,
 * MenuItemModifierGroup, MenuItemCuisine and MenuItemDietaryTag, and the rules
 * that govern them. A dish is WRITTEN by vendors, MODERATED by admins and READ
 * by customers — the same reason tax and marketing are their own modules: no
 * one audience module can own a table the other two depend on.
 *
 * Imports nothing from vendor, customer or geography. Vendor, admin and
 * customer consume it; it never consumes them. The only admin imports are the
 * shared ones every domain module uses — requirePermission and the country
 * scope resolver — exactly as tax and marketing do.
 *
 *   exports createMealsVendorRouter → mounted by the vendor module at
 *     /vendor/v1/menu, behind the vendor auth chain and its ACTIVE gate
 *   exports mealsAdminRouter        → mounted by the admin v1 router at
 *     /admin/v1/vendors/meals, behind the admin auth chain
 *   exports RESOLUTION ONLY to other modules — never authoring
 */

export { createMealsVendorRouter } from "./routes/vendor.routes"
export { type OfferPreview } from "./controllers/meals.vendor.controller"
export { default as mealsAdminRouter } from "./routes/admin.routes"

/*
 * The PUBLIC surface for other modules: resolution only, never authoring.
 *
 * `SELLABLE_*_WHERE` are the dish half of marketplace visibility — every
 * customer read embeds them rather than restating them. `effectiveListPriceMinor`
 * is the one answer to "what is this dish listed at, at this outlet".
 */
export { SELLABLE_MENU_ITEM_WHERE, SELLABLE_MEAL_WHERE } from "./lib/visibility"
export { effectiveListPriceMinor } from "./lib/menu.rules"
/* A dish's photographs as any reader receives them: the select that fetches
 * the processed masters, and the one place a master becomes a stable public
 * URL. Readers never see an original's key. */
export { IMAGE_SELECT as MEAL_IMAGE_SELECT, presentMealImage } from "./services/images.service"
