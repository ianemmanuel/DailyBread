import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, CalendarDays, Compass, MapPinned } from "lucide-react"

import { HowItWorks } from "@/components/home/HowItWorks"
import { Button } from "@/components/ui/button"

/*
 * `/how-it-works` — the full version of the landing page's three steps.
 *
 * A starting point: it says only what the app does TODAY (principle 11). No
 * delivery-time promises, no counts, and nothing about checkout or payment —
 * those do not exist yet, and a page explaining a product must not describe
 * a different one. Grow it as features land.
 *
 * Static: no cookie, no auth, no fetch.
 */

export const metadata: Metadata = {
  title      : "How DailyBread works",
  description: "Pick your city, tell us where to deliver, and see the kitchens that can actually reach you.",
  alternates : { canonical: "/how-it-works" },
}

const DETAILS = [
  {
    icon : Compass,
    title: "Look around first",
    body : "Browsing a city — its places, meals and offers — needs no account. You only sign in for things that are yours to keep, like saved delivery addresses.",
  },
  {
    icon : MapPinned,
    title: "Your address decides what you see",
    body : "Without an address you see everything a city offers. Set one and the lists narrow to the places whose own delivery area covers it — each kitchen decides how far it delivers, and we only show the ones that can reach you.",
  },
  {
    icon : CalendarDays,
    title: "Meal plans",
    body : "A meal plan is a run of meals from one kitchen on the days you choose. Plans belong to individual kitchens, so what you can choose depends on your city and your address.",
    link : { href: "/about", label: "More about meal plans" },
  },
] as const

export default function HowItWorksPage() {
  return (
    <>
      <header className="band-tight max-w-2xl space-y-4">
        <h1 className="heading-xl text-balance">How DailyBread works</h1>
        <p className="lede">
          We connect you with the kitchens cooking in your city — and only ever show you the
          ones that can actually deliver to where you are.
        </p>
      </header>

      <HowItWorks />

      <section aria-labelledby="details-title" className="band">
        <h2 id="details-title" className="heading-lg mb-6 sm:mb-8">The details</h2>
        <div className="grid gap-5 md:grid-cols-3">
          {DETAILS.map(({ icon: Icon, title, body, ...rest }) => (
            <div key={title} className="surface flex flex-col gap-3 p-6">
              <span className="flex size-11 items-center justify-center rounded-2xl bg-primary-subtle">
                <Icon aria-hidden className="size-5 text-primary-subtle-fg" />
              </span>
              <h3 className="font-display text-lg font-semibold tracking-tight text-foreground">{title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
              {"link" in rest && (
                <Link
                  href={rest.link.href}
                  className="mt-auto inline-flex cursor-pointer items-center gap-1.5 rounded-md text-sm font-medium text-primary-text underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {rest.link.label}
                  <ArrowRight aria-hidden className="size-4" />
                </Link>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="band-tight">
        <Button asChild size="lg" className="h-12 rounded-full px-7 text-base">
          <Link href="/city">
            Choose your city
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        </Button>
      </section>
    </>
  )
}
