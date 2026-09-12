"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { clientFetch } from "@/lib/api/client"
import type { MenuCurrency } from "@/lib/menu/money"

/*
 * The vendor's offers.
 *
 * `state` and `appliesNow` are computed by the backend and rendered verbatim.
 * Nothing here re-derives whether an offer is running — that is the standing
 * rule in CLAUDE.md, and it matters more here than most places because the same
 * answer will later decide what a customer is charged.
 */

export type DiscountType = "PERCENTAGE_OFF_ITEMS" | "AMOUNT_OFF_ORDER"

export type DiscountState =
  | "SUSPENDED" | "PAUSED" | "EXPIRED" | "EXHAUSTED"
  | "SCHEDULED" | "AWAITING_GO_LIVE" | "RUNNING"

export type DiscountDay =
  | "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY" | "SUNDAY"

export interface DiscountTarget { id: string; name: string }

export interface Discount {
  id         : string
  name       : string
  description: string | null
  type       : DiscountType
  fundingSource: "VENDOR" | "PLATFORM" | "SPLIT"

  percentBps      : number | null
  amountMinor     : number | null
  minSubtotalMinor: number | null

  appliesToAllOutlets: boolean
  appliesToAllItems  : boolean
  outlets: DiscountTarget[]
  items  : DiscountTarget[]

  startsAt  : string
  endsAt    : string | null
  daysOfWeek: DiscountDay[]
  startTime : string | null
  endTime   : string | null

  budgetMinor    : number | null
  spentMinor     : number
  maxRedemptions : number | null
  redemptionCount: number
  maxPerCustomer : number | null

  isPaused        : boolean
  suspendedAt     : string | null
  suspensionReason: string | null

  /** Derived server-side. Never recomputed here. */
  state     : DiscountState
  /** Whether the daily window is open this minute — separate from state, since
   *  a 5–7pm offer is RUNNING all week. */
  appliesNow: boolean
  /** False until orders exist to redeem against. Shown, not hidden. */
  capsEnforced: boolean

  createdAt: string
  updatedAt: string
}

export interface DiscountContextItem {
  id            : string
  name          : string
  basePriceMinor: number
  taxCategoryId : string | null
}

export interface DiscountContext {
  currency: MenuCurrency
  outlets : DiscountTarget[]
  items   : DiscountContextItem[]
  /** Basis points. Null when no rate is set — the preview then says so rather
   *  than showing a figure that ignores a cut the vendor will actually pay. */
  commissionRateBps: number | null
  tax: {
    pricesIncludeTax: boolean
    label           : string
    standardRateBps : number | null
  }
  maxDiscountBps: number
  vendorIsLive  : boolean
}

export interface UpsertDiscountRequest {
  name       : string
  description: string | null
  type       : DiscountType

  percentBps      ?: number
  amountMinor     ?: number
  minSubtotalMinor?: number | null

  appliesToAllOutlets: boolean
  outletIds          : string[]
  appliesToAllItems  : boolean
  menuItemIds        : string[]

  startsAt  : string
  endsAt    : string | null
  daysOfWeek: DiscountDay[]
  startTime : string | null
  endTime   : string | null

  budgetMinor   : number | null
  maxRedemptions: number | null
  maxPerCustomer: number | null
}

export const discountKeys = {
  all    : ["discounts"] as const,
  context: ["discounts", "context"] as const,
  one    : (id: string) => ["discounts", id] as const,
}

export function useDiscountContext() {
  return useQuery({
    queryKey : discountKeys.context,
    queryFn  : () => clientFetch<DiscountContext>("/api/discounts/context"),
    staleTime: 5 * 60 * 1000,
  })
}

export function useDiscounts() {
  return useQuery({
    queryKey: discountKeys.all,
    queryFn : () => clientFetch<Discount[]>("/api/discounts"),
  })
}

export function useDiscount(discountId: string | null) {
  return useQuery({
    queryKey: discountKeys.one(discountId ?? ""),
    queryFn : () => clientFetch<Discount>(`/api/discounts/${discountId}`),
    enabled : !!discountId,
  })
}

function invalidate(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: discountKeys.all })
}

export function useCreateDiscount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: UpsertDiscountRequest) =>
      clientFetch<Discount>("/api/discounts", { method: "POST", body: JSON.stringify(body) }),
    onSuccess : () => invalidate(queryClient),
  })
}

export function useUpdateDiscount(discountId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: UpsertDiscountRequest) =>
      clientFetch<Discount>(`/api/discounts/${discountId}`, { method: "PUT", body: JSON.stringify(body) }),
    onSuccess : () => invalidate(queryClient),
  })
}

/** The vendor's own switch. An admin suspension is a different thing entirely
 *  and is not liftable from here. */
export function useSetDiscountPaused() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ discountId, isPaused }: { discountId: string; isPaused: boolean }) =>
      clientFetch<Discount>(`/api/discounts/${discountId}/paused`, {
        method: "PATCH", body: JSON.stringify({ isPaused }),
      }),
    onSuccess : () => invalidate(queryClient),
  })
}

export function useDeleteDiscount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (discountId: string) =>
      clientFetch<{ deleted: boolean }>(`/api/discounts/${discountId}`, { method: "DELETE" }),
    onSuccess : () => invalidate(queryClient),
  })
}
