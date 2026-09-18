import Form from "next/form"
import { ArrowRight, MapPin } from "lucide-react"

import { Button } from "@/components/ui/button"

/*
 * The "where should we deliver?" field. A Server Component: `next/form` submits
 * as a normal GET to /discover?location=… and adds client-side navigation and
 * prefetching on top, so it works before any JavaScript loads.
 *
 * The focus ring is drawn on the whole pill (`focus-within`) rather than the
 * bare input, so keyboard focus is still clearly visible.
 */
export function HeroSearch({ placeholder }: { placeholder: string }) {
  return (
    <Form
      action="/discover"
      className="flex w-full max-w-md items-center gap-2 rounded-2xl border border-border bg-card p-2 shadow-sm transition-shadow focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30"
    >
      <label htmlFor="hero-location" className="sr-only">
        Delivery address
      </label>
      <MapPin aria-hidden className="ml-2 size-5 shrink-0 text-primary-text" />
      <input
        id="hero-location"
        name="location"
        type="text"
        required
        autoComplete="street-address"
        placeholder={placeholder}
        /* text-base (16px) on phones stops iOS zooming into the field on focus. */
        className="h-10 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:outline-none sm:text-sm"
      />
      <Button type="submit" size="icon-lg" className="shrink-0 rounded-xl" aria-label="Find food near this address">
        <ArrowRight className="size-5" />
      </Button>
    </Form>
  )
}
