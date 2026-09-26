import Image from "next/image"
import Link from "next/link"
import { CalendarDays } from "lucide-react"

import { Button } from "@/components/ui/button"
import { getMealPlansContent } from "@/constants/home/meal-plans-content"

/*
 * Meal plans, explained rather than merchandised.
 *
 * The three plan cards that were here carried invented names, prices and a
 * "Most popular" badge — a made-up ranking of made-up products. They are gone
 * and are not coming back to THIS page: when a meal-plan read exists, real
 * plans belong on a city page, because a plan is sold by an outlet in a market
 * and there is no such thing as a global one.
 *
 * What is left says what a plan IS, which is true everywhere and is the part a
 * first-time visitor actually needs. The two photographs are atmosphere and
 * carry no captions, prices or names, so nothing here can be mistaken for
 * inventory.
 */
export async function MealPlans() {
  const { eyebrow, title, body, steps, cta, images } = await getMealPlansContent()

  return (
    <section
      aria-labelledby="meal-plans-title"
      className="band grid items-center gap-10 lg:grid-cols-2 lg:gap-16"
    >
      <div className="flex flex-col items-start gap-5">
        <p className="eyebrow">
          <CalendarDays aria-hidden className="size-4" />
          {eyebrow}
        </p>
        <h2 id="meal-plans-title" className="heading-xl uppercase">
          {title}
        </h2>
        <p className="lede max-w-md">{body}</p>

        <ol className="space-y-3">
          {steps.map((step, index) => (
            <li key={step} className="flex items-center gap-3 text-sm text-muted-foreground-strong">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-xs font-semibold text-primary-subtle-fg">
                {index + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>

        <Button asChild variant="brand" className="mt-1 h-11 rounded-full px-6">
          <Link href={cta.href}>{cta.label}</Link>
        </Button>
      </div>

      {/* Two photographs, offset. Decorative — hence empty alt text and no
          caption of any kind. */}
      <div className="grid grid-cols-2 gap-4">
        <div className="photo-frame aspect-3/4 overflow-hidden rounded-2xl">
          <Image
            src={images[0]}
            alt=""
            fill
            sizes="(min-width: 1024px) 280px, 45vw"
            className="object-cover"
          />
        </div>
        <div className="photo-frame mt-8 aspect-3/4 overflow-hidden rounded-2xl">
          <Image
            src={images[1]}
            alt=""
            fill
            sizes="(min-width: 1024px) 280px, 45vw"
            className="object-cover"
          />
        </div>
      </div>
    </section>
  )
}
