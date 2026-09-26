import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, CalendarDays } from "lucide-react"

import { HowItWorks } from "@/components/home/HowItWorks"
import { Markets } from "@/components/home/Markets"
import { Button } from "@/components/ui/button"

/*
 * `/about` — what DailyBread is, globally.
 *
 * It replaces "Meal plans" in the global navbar, and the swap is the point:
 * a meal plan is sold by an outlet in a city, so a GLOBAL meal-plan page could
 * only ever describe the idea while pretending to be a destination. This page
 * describes the idea honestly and points at the markets where plans actually
 * exist.
 *
 * Every claim here is true today. No customer counts, no kitchen counts, no
 * launch dates, no cities we have not opened (principle 11) — the only numbers
 * on the page come from `Markets`, which reads them from the backend.
 *
 * Static: no cookie, no auth, one cached read.
 */

export const revalidate = 3600

export const metadata: Metadata = {
  title      : "About DailyBread",
  description: "Good food from local kitchens, delivered — and weekly meal plans so you can stop deciding every evening.",
  alternates : { canonical: "/about" },
}

export default function AboutPage() {
  return (
    <>
      <header className="band-tight max-w-2xl space-y-4">
        <h1 className="heading-xl text-balance">
          Good food, from kitchens near you
        </h1>
        <p className="lede">
          DailyBread is a marketplace for the places that already cook well
          where you live — restaurants, cloud kitchens and home-style caterers.
          We open one city at a time, and we only show you kitchens that can
          actually reach your address.
        </p>
      </header>

      <HowItWorks />

      <section aria-labelledby="about-plans-title" className="band">
        <div className="surface flex flex-col gap-5 p-6 sm:p-8">
          <p className="eyebrow">
            <CalendarDays aria-hidden className="size-4" />
            Meal plans
          </p>
          <h2 id="about-plans-title" className="heading-lg text-balance">
            Decide once, eat all week
          </h2>
          <p className="lede max-w-2xl">
            A meal plan is a run of meals from one kitchen, delivered on the
            days you choose. It is the part of DailyBread we care most about:
            ordering dinner is a solved problem, but deciding what to eat every
            single evening is not.
          </p>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Plans are offered by individual kitchens, so which ones you can
            subscribe to depends on the city you are ordering in — and, once
            you have set a delivery address, on which kitchens can reach it.
          </p>

          <div>
            <Button asChild size="lg" className="h-11 rounded-full px-6">
              <Link href="/city">
                Find your city
                <ArrowRight aria-hidden className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <Markets />
    </>
  )
}
