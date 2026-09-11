"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { clientFetch } from "@/lib/api/client"
import type {
  VendorProfile, UpsertVendorProfileRequest, VendorGoLiveStatus, VendorFoodTagOptions,
} from "@repo/types/vendor-app"

/*
 * Roadmap Phase 5 (CLAUDE.md) — VendorProfile was 100% unbuilt before this
 * pass (schema-only, zero backend/frontend code anywhere). Same
 * lib/queries hook shape as account-documents.ts/payout.ts.
 */

export const profileKeys = {
  profile     : ["profile"] as const,
  goLiveStatus: ["profile", "goLiveStatus"] as const,
  foodTags    : ["profile", "foodTags"] as const,
}

export function useVendorProfile() {
  return useQuery({
    queryKey: profileKeys.profile,
    queryFn : () => clientFetch<VendorProfile | null>("/api/profile"),
  })
}

/*
 * The cuisines and dietary tags this vendor's country offers. Admin-curated
 * reference data, so it is cached for the session rather than refetched on
 * every form mount — the proxy route caches it server-side too.
 */
export function useVendorFoodTags() {
  return useQuery({
    queryKey: profileKeys.foodTags,
    queryFn : () => clientFetch<VendorFoodTagOptions>("/api/profile/food-tags"),
    staleTime: 5 * 60 * 1000,
  })
}

export function useGoLiveStatus() {
  return useQuery({
    queryKey: profileKeys.goLiveStatus,
    queryFn : () => clientFetch<VendorGoLiveStatus>("/api/profile/go-live-status"),
  })
}

function invalidateProfile(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: profileKeys.profile })
  queryClient.invalidateQueries({ queryKey: profileKeys.goLiveStatus })
}

export function useUpsertVendorProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UpsertVendorProfileRequest) =>
      clientFetch<VendorProfile>("/api/profile", {
        method: "PUT",
        body  : JSON.stringify(input),
      }),
    onSuccess: () => invalidateProfile(queryClient),
  })
}

export function usePublishProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => clientFetch<VendorProfile>("/api/profile/publish", { method: "POST" }),
    onSuccess : () => invalidateProfile(queryClient),
  })
}

export function useUnpublishProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => clientFetch<VendorProfile>("/api/profile/unpublish", { method: "POST" }),
    onSuccess : () => invalidateProfile(queryClient),
  })
}
