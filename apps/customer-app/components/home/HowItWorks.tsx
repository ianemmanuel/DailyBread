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
 */
export function HowItWorks() {
  return (
    <section aria-labelledby="how-it-works-title" className="band">
      <h2 id="how-it-works-title" className="heading-lg mb-6 sm:mb-8">
        {HOW_IT_WORKS_TITLE}
      </h2>

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
