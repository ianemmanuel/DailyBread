import { backendFetch } from "@/lib/api/server"
import { proxyBackendCall } from "@/lib/api/route-handler"
import type { VendorFoodTagOptions } from "@repo/types/vendor-app"

/*
 * GET /api/profile/food-tags — the cuisines and dietary tags this vendor's
 * country offers.
 *
 * Admin-curated reference data that changes rarely, so it is cached briefly
 * rather than refetched every time the form mounts. Next hashes the
 * Authorization header into the Data Cache key, so one vendor's options can
 * never be served to another.
 */
export async function GET() {
  return proxyBackendCall(() =>
    backendFetch<VendorFoodTagOptions>("/vendor/v1/profile/food-tags", {
      revalidate: 300,
      tags      : ["vendor-food-tags"],
    }),
  )
}
