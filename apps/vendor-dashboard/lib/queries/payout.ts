"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { clientFetch } from "@/lib/api/client"
import { useRefreshServerState } from "./server-refresh"
import { profileKeys } from "./profile"
import type {
  AvailablePayoutMethod,
  VendorPayoutAccount,
  AddPayoutAccountRequest,
  VendorSupportedBanks,
  PayoutVerificationRequirement,
  PresignUploadRequest,
  PresignUploadResponse,
} from "@repo/types/vendor-app"

/*
 * Roadmap Phase 4 (CLAUDE.md) — the vendor.payout.routes.ts backend was
 * already fully built (add/list/get/set-default/remove); this is the
 * frontend wiring it was missing. Same lib/queries hook shape as
 * account-documents.ts.
 */

export const payoutKeys = {
  methods    : ["payout", "methods"] as const,
  banks      : (methodId: string) => ["payout", "banks", methodId] as const,
  accounts   : ["payout", "accounts"] as const,
  requirement: ["payout", "verification-requirement"] as const,
}

/*
 * How this vendor's country verifies bank accounts, and — in MANUAL mode —
 * which proof document to upload. Decides which variant of the payout form
 * renders: PROVIDER resolves the account holder's name automatically and
 * asks for no document; MANUAL asks the vendor to assert the name and prove
 * it. The two paths are separate, with no fallback between them.
 *
 * Country-level config that changes about never — cached for the session.
 */
export function usePayoutVerificationRequirement() {
  return useQuery({
    queryKey : payoutKeys.requirement,
    queryFn  : () => clientFetch<PayoutVerificationRequirement>("/api/payout/verification-requirement"),
    staleTime: 60 * 60 * 1000,
  })
}

/** Presign a proof upload (MANUAL mode only — the backend refuses otherwise). */
export function usePresignPayoutProof() {
  return useMutation({
    mutationFn: (input: PresignUploadRequest & { countryPaymentMethodId: string }) =>
      clientFetch<PresignUploadResponse>("/api/payout/proof/presign", {
        method: "POST",
        body  : JSON.stringify(input),
      }),
  })
}

export function usePayoutMethods() {
  return useQuery({
    queryKey: payoutKeys.methods,
    queryFn : () => clientFetch<AvailablePayoutMethod[]>("/api/payout/methods"),
  })
}

/*
 * Vendor 1E — the vendor's country/active-provider bank list. `enabled`
 * lets the caller defer the request until the BANK method is actually
 * selected, since most vendors never need it. `supported: false` (no
 * banks configured for this country/provider yet) is a normal response,
 * not an error — react-query only ever surfaces a transport/provider
 * failure as `isError`.
 */
export function usePayoutBanks(countryPaymentMethodId: string | undefined) {
  return useQuery({
    queryKey: payoutKeys.banks(countryPaymentMethodId ?? ""),
    queryFn : () => clientFetch<VendorSupportedBanks>(
      `/api/payout/banks?methodId=${encodeURIComponent(countryPaymentMethodId!)}`,
    ),
    // The directory comes from the provider that will EXECUTE the payout, so
    // it is per-method routing context, not a country-wide constant — hence
    // the method in the key, and no request until one is chosen.
    enabled  : !!countryPaymentMethodId,
    staleTime: 60 * 60 * 1000, // banks change essentially never
  })
}

export function usePayoutAccounts() {
  return useQuery({
    queryKey: payoutKeys.accounts,
    queryFn : () => clientFetch<VendorPayoutAccount[]>("/api/payout/accounts"),
  })
}

export function useAddPayoutAccount() {
  const queryClient = useQueryClient()
  // A verified payout account is a go-live requirement; see server-refresh.ts.
  const refreshServer = useRefreshServerState()
  return useMutation({
    mutationFn: (input: AddPayoutAccountRequest) =>
      clientFetch<VendorPayoutAccount>("/api/payout/accounts", {
        method: "POST",
        body  : JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: payoutKeys.accounts })
      queryClient.invalidateQueries({ queryKey: profileKeys.goLiveStatus })
      refreshServer()
    },
  })
}

export function useSetDefaultPayoutAccount() {
  const queryClient = useQueryClient()
  // A verified payout account is a go-live requirement; see server-refresh.ts.
  const refreshServer = useRefreshServerState()
  return useMutation({
    mutationFn: (id: string) =>
      clientFetch<{ success: boolean }>(`/api/payout/accounts/${id}/set-default`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: payoutKeys.accounts })
      queryClient.invalidateQueries({ queryKey: profileKeys.goLiveStatus })
      refreshServer()
    },
  })
}

export function useRemovePayoutAccount() {
  const queryClient = useQueryClient()
  // A verified payout account is a go-live requirement; see server-refresh.ts.
  const refreshServer = useRefreshServerState()
  return useMutation({
    mutationFn: (id: string) =>
      clientFetch<{ success: boolean }>(`/api/payout/accounts/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: payoutKeys.accounts })
      queryClient.invalidateQueries({ queryKey: profileKeys.goLiveStatus })
      refreshServer()
    },
  })
}
