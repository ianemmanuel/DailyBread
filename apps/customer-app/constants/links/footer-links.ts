/*
 * The footer's link groups, as data.
 *
 * ── Every href here GOES SOMEWHERE ─────────────────────────────────────────
 *
 * This file used to be fifteen links to `#`. That reads as a finished footer
 * and behaves as a broken one: a customer clicks "Track an order", nothing
 * happens, and the conclusion they draw is about the platform rather than
 * about the link. The rule is now the same one the rest of the app follows —
 * a destination that does not exist is not offered. Groups shrink rather than
 * filling up with placeholders, and a column that would be empty is gone.
 *
 * Add a link back at the moment its page lands; nothing in `Footer.tsx` has to
 * change either way.
 *
 * ── The doorways are legitimate destinations ───────────────────────────────
 *
 * `/discover` and `/meal-plans` resolve the customer's own market (from their
 * location, then their default address) and fall back to the city directory.
 * They are real answers from a global footer, which cannot know a market —
 * unlike a bare "Restaurants", which would have to invent one.
 */

export interface FooterLink {
  href: string
  label: string
}

export interface FooterGroup {
  title: string
  links: readonly FooterLink[]
}

export const FOOTER_GROUPS: readonly FooterGroup[] = [
  {
    title: "Explore",
    links: [
      { href: "/city", label: "Our cities" },
      { href: "/cuisines", label: "Cuisines" },
      { href: "/discover", label: "Find food near you" },
      { href: "/meal-plans", label: "Meal plans" },
    ],
  },
  {
    title: "Your account",
    links: [
      /* Protected routes. Signed out, Clerk returns the visitor here after
         sign-in via `redirect_url`, so the link still does what it says. */
      { href: "/account", label: "Your account" },
      { href: "/account/addresses", label: "Delivery addresses" },
      { href: "/sign-in", label: "Sign in" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About DailyBread" },
      { href: "/how-it-works", label: "How it works" },
    ],
  },
] as const

/*
 * The small print along the bottom bar, kept separate from the columns above
 * because it is legal boilerplate rather than navigation.
 *
 * EMPTY until the pages exist, and the bar drops the row rather than linking
 * nowhere. Terms, Privacy and a cookie notice are the three to add first, and
 * they are content decisions rather than code ones.
 */
export const FOOTER_LEGAL: readonly FooterLink[] = [] as const

/*
 * Social profiles. Empty until real URLs exist: an icon that does nothing when
 * tapped is the same dead link as a `#` in a column, and this row is the most
 * tapped part of a footer on a phone.
 *
 * `icon` is a NAME, not a component reference — this file is imported by a
 * Server Component and only JSON-serializable values may cross the boundary
 * (recurring bug class #5). `Footer.tsx` maps the name to the lucide icon.
 */
export const FOOTER_SOCIALS: ReadonlyArray<{
  href : string
  label: string
  icon : "instagram" | "facebook" | "twitter"
}> = [] as const
