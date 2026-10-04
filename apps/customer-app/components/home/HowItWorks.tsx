import Link from "next/link"
import { ArrowRight } from "lucide-react"

import { HOW_IT_WORKS_STEPS, HOW_IT_WORKS_TITLE } from "@/constants/home/how-it-works-content"

/*
 * The three steps, on the page that has to explain them.
 *
 * It replaces a band of invented "popular dishes". The trade is deliberate: a
 * grid of made-up food looks like a marketplace and teaches nothing, while
 * this says what actually happens next and is true on the day we open a new
 * market with one kitchen in it.
 *
 * Numbered, because the order is the product: a market, then a point, then
 * food. The numerals are decoration for a screen reader — the list is already
 * an ordered one, so it announces the position itself.
 *
 * `intro` and `more` are for the pages that SUMMARISE (the landing page,
 * /about): a sentence of context and a way to the full explanation at
 * /how-it-works. That page renders the steps without either, so it never
 * links to itself.
 */
export function HowItWorks({ intro, more }: {
  intro?: string
  more ?: { href: string; label: string }
}) {
  return (
    <section aria-labelledby="how-it-works-title" className="band">
      <div className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div className="max-w-2xl space-y-2">
          <h2 id="how-it-works-title" className="heading-lg">
            {HOW_IT_WORKS_TITLE}
          </h2>
          {intro && <p className="text-muted-foreground">{intro}</p>}
        </div>
        {more && (
          <Link
            href={more.href}
            className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md text-sm font-medium text-primary-text underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            {more.label}
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        )}
      </div>

      <ol className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        {HOW_IT_WORKS_STEPS.map(({ icon: Icon, title, body }, index) => (
          <li key={title} className="surface flex flex-col gap-3 p-6">
            <span className="flex size-11 items-center justify-center rounded-2xl bg-primary-subtle">
              <Icon aria-hidden className="size-5 text-primary-subtle-fg" />
            </span>
            <p className="flex items-baseline gap-2">
              <span aria-hidden className="text-sm font-semibold text-primary-text">
                {index + 1}
              </span>
              <span className="font-display text-lg font-semibold tracking-tight text-foreground">
                {title}
              </span>
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}
