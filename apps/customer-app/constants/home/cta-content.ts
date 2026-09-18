import { pexels } from "./placeholder-data"

/* The closing call-to-action band. Static for now. */

export interface CtaContent {
  /** Rendered as `{before} {highlight}.` with the highlight in brand orange. */
  before: string
  highlight: string
  body: string
  cta: { label: string; href: string }
  /** Two small decorative photos either side, shown on large screens only. */
  decorImages: [string, string]
}

const STATIC_CTA: CtaContent = {
  before: "Good food should be",
  highlight: "easy",
  body: "Local kitchens, honest food and delivery you can count on — all in one place.",
  cta: { label: "Get started", href: "/sign-up" },
  decorImages: [pexels(461198, 320, 320), pexels(1099680, 320, 320)],
}

export async function getCtaContent(): Promise<CtaContent> {
  return STATIC_CTA
}
