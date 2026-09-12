import { backendFetch } from "@/lib/api/server"
import type { Discount } from "@/lib/queries/discounts"

/**
 * The one place vendor discount endpoints are called server-side.
 *
 * Not cached: an offer's state is time-derived, so a cached read would show a
 * scheduled offer as still scheduled after it started. The list page is cheap
 * and the correctness matters more than the round trip.
 */
export async function getDiscount(discountId: string): Promise<Discount | null> {
  try {
    return await backendFetch<Discount>(`/vendor/v1/discounts/${discountId}`, { cache: "no-store" })
  } catch (err) {
    // A 404 becomes null so the page can call notFound(); anything else is a
    // real failure and should not be disguised as a missing offer.
    if (err && typeof err === "object" && "status" in err && (err as { status: number }).status === 404) {
      return null
    }
    throw err
  }
}
