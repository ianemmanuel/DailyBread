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

export interface MenuContext {
  currency      : MenuCurrency
  outlets       : MenuOutletOption[]
  sections      : MenuSectionOption[]
  cuisines      : MenuTagOption[]
  dietaryTags   : MenuTagOption[]
  maxImages     : number
  maxCuisines   : number
  maxDietaryTags: number
}

export interface MenuItemImage {
  storageKey: string
  url       : string | null
}

export interface MenuItemOutlet {
  mealId            : string
  outletId          : string
  outletName        : string
  isAvailable       : boolean
  priceMinorOverride: number | null
  adminStatus       : string
}

export interface MenuItem {
  id             : string
  name           : string
  description    : string | null
  basePriceMinor : number
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
  createdAt      : string
  updatedAt      : string
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
  basePriceMinor: number
  sectionId     : string | null
  imageKeys     : string[]
  cuisineIds    : string[]
  dietaryTagIds : string[]
  outletIds     : string[]
  priceOverrides: Record<string, number | null>
}

export const menuKeys = {
  context : ["menu", "context"] as const,
  items   : ["menu", "items"] as const,
  item    : (id: string) => ["menu", "items", id] as const,
  sections: ["menu", "sections"] as const,
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

export function useMenuItems(params: { search?: string; sectionId?: string; page?: number } = {}) {
  const qs = new URLSearchParams()
  if (params.search)    qs.set("search", params.search)
  if (params.sectionId) qs.set("sectionId", params.sectionId)
  if (params.page)      qs.set("page", String(params.page))

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
    onSuccess : () => { queryClient.invalidateQueries({ queryKey: menuKeys.items }) },
  })
}

export function useUpdateMenuItem(itemId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: UpsertMenuItemRequest) =>
      clientFetch<MenuItem>(`/api/menu/items/${itemId}`, { method: "PUT", body: JSON.stringify(body) }),
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
