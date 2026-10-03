"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { clientFetch } from "@/lib/api/client"
import type { MenuCurrency } from "@/lib/menu/money"
import type { MenuItem } from "@/lib/queries/menu"

/*
 * Vendor MENUS — an outlet's named, branded selection of the meals it already
 * sells. Not MenuSection (a vendor-wide heading) and not MenuItem (the dish):
 * a menu references the outlet's Meal rows and copies nothing about them.
 *
 * Every read and write goes through /api/menus/** to the backend, which checks
 * the outlet is the caller's on every call. Nothing here decides ownership.
 */

export interface MenuImage {
  url        : string
  width      : number
  height     : number
  blurDataUrl: string
}

/** One meal as a menu (or the picker) shows it — read from the meal itself. */
export interface MenuMealRow {
  mealId      : string
  menuItemId  : string
  name        : string
  portionSize : string | null
  /** The outlet's list price: its override, else the dish's base price. */
  priceMinor  : number
  isAvailable : boolean
  isArchived  : boolean
  reviewStatus: MenuItem["reviewStatus"]
  adminStatus : string
  image       : MenuImage | null
  section     : { id: string; name: string } | null
}

/** Meals grouped by the dish's existing section, in the vendor's order. */
export interface MenuSectionGroup {
  id   : string | null
  name : string | null
  meals: MenuMealRow[]
}

export interface VendorMenu {
  id             : string
  name           : string
  description    : string | null
  outlet         : { id: string; name: string }
  /** The current logo's key — sent back on save to mean "keep it". */
  imageStorageKey: string
  image          : MenuImage | null
  mealCount      : number
  createdAt      : string
  updatedAt      : string
}

export interface VendorMenuDetail extends VendorMenu {
  currency: MenuCurrency
  mealIds : string[]
  sections: MenuSectionGroup[]
}

export interface OutletMealsForMenu {
  outlet  : { id: string; name: string }
  currency: MenuCurrency
  sections: MenuSectionGroup[]
}

export interface UpsertMenuRequest {
  /** Create only; the backend refuses a change on update. */
  outletId?   : string
  name        : string
  description : string | null
  /** A fresh staged upload, or the current `imageStorageKey` to keep it. */
  imageKey    : string
  /** Absent leaves the menu's meals as they are; a list replaces them. */
  mealIds    ?: string[]
}

export const menusKeys = {
  all        : ["menus"] as const,
  one        : (id: string) => ["menus", id] as const,
  outletMeals: (outletId: string) => ["menus", "outlet-meals", outletId] as const,
}

export function useOutletMealsForMenu(outletId: string | null) {
  return useQuery({
    queryKey: menusKeys.outletMeals(outletId ?? ""),
    queryFn : () => clientFetch<OutletMealsForMenu>(`/api/menus/outlet-meals?outletId=${encodeURIComponent(outletId!)}`),
    enabled : !!outletId,
  })
}

export function useCreateMenu() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: UpsertMenuRequest) =>
      clientFetch<VendorMenuDetail>("/api/menus", { method: "POST", body: JSON.stringify(body) }),
    onSuccess : () => queryClient.invalidateQueries({ queryKey: menusKeys.all }),
  })
}

export function useUpdateMenu(menuId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: UpsertMenuRequest) =>
      clientFetch<VendorMenuDetail>(`/api/menus/${menuId}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess : () => queryClient.invalidateQueries({ queryKey: menusKeys.all }),
  })
}
