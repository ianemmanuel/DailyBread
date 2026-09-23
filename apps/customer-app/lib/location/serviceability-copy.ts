import type { ServiceabilityStatus } from "@repo/types/customer-app"

/*
 * What each coverage verdict means, in words a customer reads.
 *
 * The backend returns a CODE and the storefront owns the wording — the same
 * split VendorGoLiveBlocker makes on the vendor side. One code, one meaning,
 * and the copy can be rewritten without touching a service.
 *
 * The distinctions here are worth keeping, because they lead to genuinely
 * different next steps: "we are not in your area" is permanent-ish and worth
 * an email signup, "the area is paused" is temporary and worth trying later,
 * and "not configured" is OUR bug rather than the customer's problem and must
 * never be phrased as though we do not cover the address.
 */
export const SERVICEABILITY_COPY: Record<
  ServiceabilityStatus,
  { title: string; body: string }
> = {
  SERVICEABLE: {
    title: "We deliver here",
    body : "Kitchens near this address are ready to cook for you.",
  },
  OUTSIDE_COVERAGE: {
    title: "We are not here yet",
    body : "This address is outside every city we currently deliver to. Pick a city below to see where we do operate.",
  },
  AREA_NOT_LAUNCHED: {
    title: "Not open in this area yet",
    body : "We operate in this city, but this particular area has not opened for orders. It is worth checking again soon.",
  },
  AREA_PAUSED: {
    title: "Paused right now",
    body : "Deliveries around this address are temporarily on hold. This is usually short — try again a little later.",
  },
  CITY_INACTIVE: {
    title: "This city is closed",
    body : "We are not taking orders in this city at the moment.",
  },
  AREA_NOT_CONFIGURED: {
    /* Our configuration gap, not the customer's address. Saying "we do not
     * deliver here" would be a lie, and would train someone to stop checking. */
    title: "We could not check this address",
    body : "Something on our side is not set up for this area yet. Try picking your city instead.",
  },
}
