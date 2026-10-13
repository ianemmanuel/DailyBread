import { useQuery } from "@tanstack/react-query"
import type { AdminActionReason } from "@repo/types/admin-app"

export const actionReasonKeys = {
  all : ["action-reasons"] as const,
  list: (appliesTo: string) => [...actionReasonKeys.all, appliesTo] as const,
}

async function fetchActionReasons(appliesTo: string): Promise<AdminActionReason[]> {
  const res  = await fetch(`/api/vendors/action-reasons?appliesTo=${encodeURIComponent(appliesTo)}`)
  const json = await res.json()
  if (!res.ok) throw new Error(json.message ?? "Failed to load reasons")
  return json.data ?? []
}

/**
 * Reasons an admin can pick from when rejecting an application or asking
 * for revisions — `appliesTo` matches AdminActionReason.appliesTo on the
 * backend (e.g. "vendor_application.rejected"). Reasons change rarely, so
 * a long staleTime avoids refetching every time a reviewer opens the form.
 */
export function useApplicationActionReasons(appliesTo: string) {
  return useQuery({
    queryKey : actionReasonKeys.list(appliesTo),
    queryFn  : () => fetchActionReasons(appliesTo),
    staleTime: 5 * 60_000,
  })
}
