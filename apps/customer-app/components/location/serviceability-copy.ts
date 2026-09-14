import type { ServiceabilityStatus } from "@repo/types/customer-app"

/*
 * The ONE place a serviceability code becomes a sentence.
 *
 * The backend returns a code and this app owns the wording — the same split
 * VendorGoLiveBlocker / lib/readiness.ts makes on the vendor side. Keeping it
 * in one file is what stops the header, the location sheet and the empty feed
 * describing the same situation three different ways.
 *
 * Note what is NOT said: nothing here mentions zones, levels or operational
 * status. That is internal operational vocabulary; a customer wants to know
 * whether food can reach them and, if not, whether waiting will help.
 */

interface Copy {
  title: string
  body : string
}

export const SERVICEABILITY_COPY: Record<ServiceabilityStatus, Copy> = {
  SERVICEABLE: {
    title: "We deliver here",
    body : "You're in our delivery area — here's what's available near you.",
  },

  OUTSIDE_COVERAGE: {
    title: "We're not in this area yet",
    body : "This address is outside everywhere we currently operate. Try a different location, or check back as we open new areas.",
  },

  /* Inside a city we run, but the specific area has not been opened for
   * ordering. Worth distinguishing from the above because it genuinely may
   * change soon, and saying "we don't deliver there" would be misleading. */
  AREA_NOT_LAUNCHED: {
    title: "Not open here just yet",
    body : "We're in this city but haven't started delivering to this part of it. We're expanding — it's worth checking again soon.",
  },

  /* Temporary and explicitly so, because "we don't deliver here" would send
   * someone away from an address we normally serve. */
  AREA_PAUSED: {
    title: "Deliveries are paused here",
    body : "Ordering in this area is temporarily on hold. It should be back shortly — try again a little later.",
  },

  CITY_INACTIVE: {
    title: "We've paused this city",
    body : "Ordering is unavailable across this city at the moment. Try another location, or check back soon.",
  },

  /* A configuration gap on our side, not an answer about the customer's
   * address — so it never claims we do not deliver there. */
  AREA_NOT_CONFIGURED: {
    title: "We couldn't check this address",
    body : "Something on our side stopped us confirming delivery here. You can still save it and try browsing.",
  },
}
