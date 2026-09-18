import { pexels } from "./placeholder-data"

/*
 * The full-width photo band ("Discover something new") — static for now. Like
 * the hero, this is a natural slot for admin-managed campaign content later.
 *
 * Image spec: landscape, at least 1920 px wide, with the food in the centre or
 * right and a darker left side for the text.
 */

export interface EditorialContent {
  title: string
  body: string
  cta: { label: string; href: string }
  image: { src: string; alt: string }
}

const STATIC_EDITORIAL: EditorialContent = {
  title: "Discover something new",
  body: "New places. New dishes. Your next favourite meal might be closer than you think.",
  cta: { label: "Explore now", href: "/discover" },
  image: {
    src: pexels(2098085, 1920),
    alt: "An assortment of nigiri and maki on a wooden serving board",
  },
}

export async function getEditorialContent(): Promise<EditorialContent> {
  return STATIC_EDITORIAL
}
