/*
 * The footer's link groups, as data.
 *
 * Every href is "#" for now, deliberately — none of these pages exist yet and a
 * link to a route that 404s is worse than one that goes nowhere. Replace them
 * group by group as the pages land; nothing else in Footer.tsx has to change.
 *
 * The four columns mirror what a customer actually comes to a footer for, in
 * the order design.png sets them: somewhere to browse, who we are, help when an
 * order has gone wrong, and the legal line.
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
      { href: "#", label: "Discover" },
      { href: "#", label: "Meal Plans" },
      { href: "#", label: "Restaurants" },
      { href: "#", label: "Cuisines" },
      { href: "#", label: "Offers" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "#", label: "About Us" },
      { href: "#", label: "Careers" },
      { href: "#", label: "Press" },
      { href: "#", label: "Blog" },
      { href: "#", label: "Partner with us" },
    ],
  },
  {
    title: "Support",
    links: [
      { href: "#", label: "Help Center" },
      { href: "#", label: "Contact Us" },
      { href: "#", label: "Track an order" },
      { href: "#", label: "Delivery" },
      { href: "#", label: "Refunds & Returns" },
    ],
  },
] as const

/** The small print along the bottom bar, kept separate from the columns above
 *  because it is legal boilerplate rather than navigation. */
export const FOOTER_LEGAL: readonly FooterLink[] = [
  { href: "#", label: "Terms" },
  { href: "#", label: "Privacy" },
  { href: "#", label: "Cookies" },
] as const
