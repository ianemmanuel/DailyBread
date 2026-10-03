"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { clientFetch } from "@/lib/api/client"
import type { MenuCurrency } from "@/lib/menu/money"

/*
 * The vendor's menu. Same lib/queries hook shape as profile.ts and payout.ts.
 *
 * A dish is authored once (the menu item) and sold at one or more of the
 * vendor's outlets, so everything here addresses the ITEM; per-outlet
 * availability is its own small mutation because it is a service action a
 * kitchen does mid-shift, not a menu edit.
 */

export interface MenuOutletOption {
  id          : string
  name        : string
  addressLine1: string
  isMainOutlet: boolean
  adminStatus : string
}

export interface MenuSectionOption {
  id      : string
  name    : string
  position: number
}

export interface MenuTagOption {
  id         : string
  slug       : string
  name       : string
  description: string | null
}

/** One tax choice this market offers. Present only for categories the
 *  country has actually rated, so the form never offers a dead option. */
export interface MenuTaxCategoryOption {
  id         : string
  name       : string
  description: string | null
  rateBps    : number
  /** "16%" — formatted by the backend so the form never re-derives it. */
  rateLabel  : string
  /** The one a dish takes when it names nothing. */
  isStandard : boolean
}

export interface MenuTaxContext {
  /** Whether a typed price already contains tax. Never assumed. */
  pricesIncludeTax: boolean
  /** "VAT" / "GST" / "Tax" — this market's own word. */
  label           : string
  /** Null when the market has set no rate. The form then shows no tax line
   *  rather than implying zero. */
  standardRateBps : number | null
  categories      : MenuTaxCategoryOption[]
}

/** What a price breaks down to. Computed server-side so this screen and any
 *  future checkout can never disagree about the same dish. */
export interface MenuItemTax {
  grossMinor: number
  netMinor  : number
  taxMinor  : number
  rateBps   : number
  rateLabel : string
  label     : string
  inclusive : boolean
}

export interface MenuContext {
  currency      : MenuCurrency
  tax           : MenuTaxContext
  outlets       : MenuOutletOption[]
  sections      : MenuSectionOption[]
  cuisines      : MenuTagOption[]
  dietaryTags   : MenuTagOption[]
  maxImages     : number
  maxCuisines   : number
  maxDietaryTags: number
}

/** One saved photo. `storageKey` identifies it to the form (sent back on save
 *  to mean "keep this one"); `url` is the processed public master — stable,
 *  never a signed link. */
export interface MenuItemImage {
  storageKey : string
  url        : string | null
  width      : number
  height     : number
  blurDataUrl: string
}

/** What a customer at ONE outlet pays for the dish right now — computed by
 *  the backend with the storefront's own evaluator. Rendered, never re-derived. */
export interface MenuOutletPricing {
  /** The outlet's price when it set one, otherwise the dish's base price. */
  listPriceMinor: number
  /** What a customer there pays now. */
  priceMinor    : number
  /** The struck-through figure — present only while an offer is applying. */
  wasPriceMinor : number | null
  /** The offer applying there now, with its CUSTOMER-facing label. */
  offer         : { id: string; label: string; percentBps: number | null } | null
}

export interface MenuItemOutlet {
  mealId            : string
  outletId          : string
  outletName        : string
  isAvailable       : boolean
  priceMinorOverride: number | null
  adminStatus       : string
  pricing           : MenuOutletPricing
}

/** An offer covering this dish. No price here on purpose: what a customer
 *  pays differs by outlet, so it lives on each outlet's `pricing`. */
export interface MenuItemDiscount {
  id        : string
  /** The vendor's own label. */
  name      : string
  /** What a customer is told it is. */
  label     : string
  /** After the platform ceiling — what it can actually take. */
  percentBps: number
  state     : "SUSPENDED" | "PAUSED" | "EXPIRED" | "EXHAUSTED" | "SCHEDULED" | "AWAITING_GO_LIVE" | "RUNNING"
  /** Whether it is changing the price this minute at ANY of the dish's
   *  outlets. Separate from state: a happy-hour offer is RUNNING all week. */
  appliesNow: boolean
}

export interface MenuItem {
  id             : string
  name           : string
  description    : string | null
  basePriceMinor : number
  /** Where it sits inside its section. Authored, never alphabetical. */
  position       : number
  /** Minutes from accepted to ready. Null means the vendor hasn't said, which
   *  is deliberately different from zero. */
  prepTimeMinutes: number | null
  taxCategoryId  : string | null
  taxCategory    : { id: string; name: string } | null
  /** Null when the market has no rate configured. */
  tax            : MenuItemTax | null
  portionSize    : string | null
  isArchived     : boolean
  reviewStatus   : "AUTO_APPROVED" | "FLAGGED" | "MANUALLY_APPROVED" | "MANUALLY_REJECTED"
  flagReasons    : string[]
  rejectionReason: string | null
  adminStatus    : string
  section        : { id: string; name: string } | null
  images         : MenuItemImage[]
  mainImageUrl   : string | null
  cuisines       : { id: string; name: string }[]
  dietaryTags    : { id: string; name: string }[]
  outlets        : MenuItemOutlet[]
  modifierGroups : AttachedModifierGroup[]
  /** Percentage offers covering this dish. An amount-off-the-order never
   *  appears here — it is a basket rule with no per-dish price to show. */
  discounts      : MenuItemDiscount[]
  createdAt      : string
  updatedAt      : string
}

/** One choice inside a group. The price is a DELTA on the dish, never an
 *  absolute price — it may be zero, and it may be negative. */
export interface ModifierOption {
  id             : string
  name           : string
  priceDeltaMinor: number
  isAvailable    : boolean
  position       : number
}

/**
 * A group of choices a customer makes on a dish.
 *
 * "Variants" and "addons" are the same thing here, exactly as they are in the
 * schema: a size group is minSelect 1 / maxSelect 1, a sauces group is 0 / 3.
 * `required` is derived from minSelect on the backend and sent down so the
 * form never re-derives it.
 */
export interface ModifierGroup {
  id             : string
  name           : string
  description    : string | null
  minSelect      : number
  maxSelect      : number
  required       : boolean
  reviewStatus   : "AUTO_APPROVED" | "FLAGGED" | "MANUALLY_APPROVED" | "MANUALLY_REJECTED"
  flagReasons    : string[]
  rejectionReason: string | null
  options        : ModifierOption[]
  /** The ONE dish this group belongs to. Null for a group left from the old
   *  shared library with no dish: it can still be copied, never shown. */
  dish           : { id: string; name: string } | null
  createdAt      : string
  updatedAt      : string
}

/** One of a dish's own groups, as the dish returns it. */
export interface AttachedModifierGroup {
  id             : string
  name           : string
  description    : string | null
  minSelect      : number
  maxSelect      : number
  required       : boolean
  flagged        : boolean
  reviewStatus   : ModifierGroup["reviewStatus"]
  rejectionReason: string | null
  position       : number
  options        : Omit<ModifierOption, "position">[]
}

/**
 * One of the dish's groups as the meal form SAVES it. Groups are written only
 * with their dish: an `id` edits one of THIS dish's groups in place, no id
 * creates one (which is what a copy is — content, never another dish's ids).
 */
export interface DishGroupPayload {
  id         ?: string
  name        : string
  description : string | null
  minSelect   : number
  maxSelect   : number
  options     : {
    /** Present when editing an existing choice, so its id survives the save
     *  rather than the row being recreated. */
    id             ?: string
    name            : string
    priceDeltaMinor : number
    isAvailable     : boolean
  }[]
}

export interface MenuSectionRow {
  id      : string
  name    : string
  position: number
  status  : string
  _count  : { items: number }
}

export interface MenuItemListResult {
  items     : MenuItem[]
  total     : number
  page      : number
  pageSize  : number
  totalPages: number
}

export interface UpsertMenuItemRequest {
  name          : string
  description   : string | null
  portionSize   : string | null
  prepTimeMinutes: number | null
  basePriceMinor: number
  sectionId     : string | null
  /* Omitted by the vendor form on purpose — a vendor does not classify their
   * own dish for tax. Absent means "leave whatever is set", which is what
   * stops a vendor's edit clearing a classification made elsewhere. */
  taxCategoryId?: string | null
  imageKeys     : string[]
  cuisineIds    : string[]
  dietaryTagIds : string[]
  outletIds     : string[]
  priceOverrides: Record<string, number | null>
  /** The dish's OWN option groups, in the order a customer meets them. */
  modifierGroups: DishGroupPayload[]
}

export const menuKeys = {
  context : ["menu", "context"] as const,
  items   : ["menu", "items"] as const,
  item    : (id: string) => ["menu", "items", id] as const,
  sections: ["menu", "sections"] as const,
  groups  : ["menu", "modifier-groups"] as const,
}

/*
 * Currency, outlets, sections and tag options in one read. Reference-ish data
 * that changes rarely, so it is cached for the session rather than refetched
 * every time the form mounts.
 */
export function useMenuContext() {
  return useQuery({
    queryKey : menuKeys.context,
    queryFn  : () => clientFetch<MenuContext>("/api/menu/context"),
    staleTime: 5 * 60 * 1000,
  })
}

export function useMenuItems(
  params: { search?: string; sectionId?: string; page?: number; pageSize?: number } = {},
) {
  const qs = new URLSearchParams()
  if (params.search)    qs.set("search", params.search)
  if (params.sectionId) qs.set("sectionId", params.sectionId)
  if (params.page)      qs.set("page", String(params.page))
  // The arrange view needs the whole menu in one read — it cannot decide what
  // comes third while looking at page two.
  if (params.pageSize)  qs.set("pageSize", String(params.pageSize))

  return useQuery({
    queryKey: [...menuKeys.items, params],
    queryFn : () => clientFetch<MenuItemListResult>(`/api/menu/items?${qs}`),
  })
}

export function useMenuItem(itemId: string | null) {
  return useQuery({
    queryKey: menuKeys.item(itemId ?? ""),
    queryFn : () => clientFetch<MenuItem>(`/api/menu/items/${itemId}`),
    enabled : !!itemId,
  })
}

export function useCreateMenuItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: UpsertMenuItemRequest) =>
      clientFetch<MenuItem>("/api/menu/items", { method: "POST", body: JSON.stringify(body) }),
    // The save wrote this dish's option groups too.
    onSuccess : () => invalidateGroups(queryClient),
  })
}

export function useUpdateMenuItem(itemId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: UpsertMenuItemRequest) =>
      clientFetch<MenuItem>(`/api/menu/items/${itemId}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess : () => {
      invalidateGroups(queryClient)
      queryClient.invalidateQueries({ queryKey: menuKeys.item(itemId) })
    },
  })
}

/** Archive or restore a dish everywhere. Nothing about it is lost either way —
 *  outlets, prices, availability and options all come back as they were. */
export function useSetMenuItemArchived(itemId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (isArchived: boolean) =>
      clientFetch<{ id: string; isArchived: boolean }>(`/api/menu/items/${itemId}/archive`, {
        method: "PATCH", body: JSON.stringify({ isArchived }),
      }),
    onSuccess : () => {
      queryClient.invalidateQueries({ queryKey: menuKeys.items })
      queryClient.invalidateQueries({ queryKey: menuKeys.item(itemId) })
    },
  })
}

/** Soft delete: the dish leaves the menu; the backend keeps the row. */
export function useDeleteMenuItem(itemId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () =>
      clientFetch<{ id: string; deleted: true }>(`/api/menu/items/${itemId}`, { method: "DELETE" }),
    onSuccess : () => {
      queryClient.invalidateQueries({ queryKey: menuKeys.items })
      queryClient.removeQueries({ queryKey: menuKeys.item(itemId) })
    },
  })
}

/** 86-ing one dish at ONE outlet, addressed by that outlet's Meal id. */
export function useSetMealAvailability(itemId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ mealId, isAvailable }: { mealId: string; isAvailable: boolean }) =>
      clientFetch<{ id: string; isAvailable: boolean }>(`/api/menu/meals/${mealId}/availability`, {
        method: "PATCH", body: JSON.stringify({ isAvailable }),
      }),
    onSuccess : () => {
      queryClient.invalidateQueries({ queryKey: menuKeys.items })
      queryClient.invalidateQueries({ queryKey: menuKeys.item(itemId) })
    },
  })
}

export function useCreateMenuSection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) =>
      clientFetch<MenuSectionOption>("/api/menu/sections", {
        method: "POST",
        body  : JSON.stringify({ name }),
      }),
    onSuccess : () => {
      // The new section has to appear in the form's own picker immediately.
      queryClient.invalidateQueries({ queryKey: menuKeys.context })
      queryClient.invalidateQueries({ queryKey: menuKeys.sections })
    },
  })
}

// ─── Modifier groups ─────────────────────────────────────────────────────────

/*
 * Every option group the vendor has, each with the dish it belongs to. Read
 * only: a group is WRITTEN with its dish's save. This list is what "copy an
 * existing group" starts from and what the Options page shows.
 */
export function useModifierGroups() {
  return useQuery({
    queryKey : menuKeys.groups,
    queryFn  : () => clientFetch<ModifierGroup[]>("/api/menu/modifier-groups"),
    staleTime: 60 * 1000,
  })
}

/** A group's options show on its dish and on the Options page alike. */
function invalidateGroups(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: menuKeys.groups })
  queryClient.invalidateQueries({ queryKey: menuKeys.items })
}

/** 86-ing one choice. Its own mutation rather than a group save, because a
 *  kitchen does this mid-shift and should not have to open a form. */
export function useSetOptionAvailability() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ optionId, isAvailable }: { optionId: string; isAvailable: boolean }) =>
      clientFetch<{ id: string; isAvailable: boolean }>(
        `/api/menu/modifier-options/${optionId}/availability`,
        { method: "PATCH", body: JSON.stringify({ isAvailable }) },
      ),
    onSuccess: () => invalidateGroups(queryClient),
  })
}

// ─── Menu structure ──────────────────────────────────────────────────────────

/*
 * Sections and ordering.
 *
 * Every reorder sends the WHOLE list in its new order, never just the rows
 * that moved — the backend refuses a partial list, because there is no correct
 * answer for where the omitted rows should land. The arrange view renders the
 * whole bucket anyway, so it has the full list to hand.
 */

export function useMenuSections() {
  return useQuery({
    queryKey : menuKeys.sections,
    queryFn  : () => clientFetch<MenuSectionRow[]>("/api/menu/sections"),
    staleTime: 60 * 1000,
  })
}

function invalidateStructure(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: menuKeys.sections })
  queryClient.invalidateQueries({ queryKey: menuKeys.items })
  // The meal form reads its section options from context.
  queryClient.invalidateQueries({ queryKey: menuKeys.context })
}

export function useRenameMenuSection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ sectionId, name }: { sectionId: string; name: string }) =>
      clientFetch(`/api/menu/sections/${sectionId}`, {
        method: "PATCH", body: JSON.stringify({ name }),
      }),
    onSuccess: () => invalidateStructure(queryClient),
  })
}

/** The heading goes; its dishes stay and fall back to unsectioned. */
export function useDeleteMenuSection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (sectionId: string) =>
      clientFetch<{ freedItems: number }>(`/api/menu/sections/${sectionId}`, { method: "DELETE" }),
    onSuccess: () => invalidateStructure(queryClient),
  })
}

export function useReorderMenuSections() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (sectionIds: string[]) =>
      clientFetch("/api/menu/sections/order", {
        method: "PUT", body: JSON.stringify({ sectionIds }),
      }),
    onSuccess: () => invalidateStructure(queryClient),
  })
}

/** `sectionId: null` arranges the unsectioned dishes. */
export function useReorderMenuItems() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ sectionId, itemIds }: { sectionId: string | null; itemIds: string[] }) =>
      clientFetch("/api/menu/items/order", {
        method: "PUT", body: JSON.stringify({ sectionId, itemIds }),
      }),
    onSuccess: () => invalidateStructure(queryClient),
  })
}

/**
 * The vendor's own currency, including how many minor-unit digits it has.
 *
 * Its own hook rather than call sites reaching into the menu context: currency
 * is a fact about the vendor's country, not about their menu, and the outlet
 * form needs it for exactly the same reason the meal form does — a money field
 * is typed in major units and stored in minor ones, and the scale is 0 for UGX
 * and 3 for KWD.
 *
 * It reads the menu-context endpoint because that is where the value already
 * lives and it is already cached. If a third surface needs more than currency,
 * this belongs on the vendor session instead.
 */
export function useVendorCurrency() {
  const { data, isLoading } = useMenuContext()
  return { currency: data?.currency ?? null, isLoading }
}
