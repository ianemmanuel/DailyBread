import Image from "next/image"
import Link from "next/link"
import { CalendarDays } from "lucide-react"

import { Button } from "@/components/ui/button"
import { getMealPlansContent } from "@/constants/home/meal-plans-content"
import { formatMoneyCompact } from "@/lib/format/money"

/*
 * "Your week, sorted" — the meal-plan pitch on the left, three plan cards on
 * the right.
 *
 * Phones and tablets: pitch on top, cards in a sideways-swipe row. Large
 * screens: one row, the pitch taking a third and the cards two thirds.
 */
export async function MealPlans() {
  const { eyebrow, title, steps, cta, currency, plans } = await getMealPlansContent()

  return (
    <section
      aria-labelledby="meal-plans-title"
      className="band grid items-center gap-10 lg:grid-cols-3 lg:gap-12"
    >
      <div className="flex flex-col items-start gap-5">
        <p className="eyebrow">
          <CalendarDays aria-hidden className="size-4" />
          {eyebrow}
        </p>
        <h2 id="meal-plans-title" className="heading-xl uppercase">
          {title}
        </h2>

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

      <ul className="rail -mx-4 px-4 md:mx-0 md:grid md:grid-cols-3 md:gap-5 md:overflow-visible md:px-0 lg:col-span-2">
        {plans.map((plan) => (
          <li key={plan.id} className="w-[72%] shrink-0 sm:w-[45%] md:w-auto">
            <Link href={plan.href} className="surface-interactive group flex h-full flex-col overflow-hidden">
              <div className="photo-frame photo-zoom aspect-4/3">
                <Image
                  src={plan.image}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 260px, (min-width: 768px) 33vw, 72vw"
                  className="object-cover"
                />
                {plan.badge && (
                  <span className="absolute top-3 left-3 rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground">
                    {plan.badge}
                  </span>
                )}
              </div>

              <div className="flex flex-1 flex-col gap-1 p-4">
                <h3 className="font-sans text-base font-semibold tracking-normal">{plan.name}</h3>
                <p className="text-xs text-muted-foreground">{plan.mealsPerWeek} meals per week</p>
                <p className="mt-auto pt-3 text-sm">
                  From{" "}
                  <span className="price font-semibold">
                    {formatMoneyCompact(plan.fromPriceMinor, currency)}
                  </span>
                  <span className="text-muted-foreground"> / meal</span>
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
