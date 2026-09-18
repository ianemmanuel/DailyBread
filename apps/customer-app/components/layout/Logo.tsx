/*
 * The wordmark. `tone="inverted"` is for the dark editorial band and the
 * footer, which sit on `--deep` in BOTH themes and so need the opposite
 * treatment from the page.
 *
 * The two tones use different brand tokens, and that is the point:
 *
 *   default   `text-primary-text` — `--primary` itself is only 2.56:1 on the
 *             cream page, which fails even the 3:1 floor that 24px bold type
 *             gets as "large text". `--primary-text` is 5.6:1 light and
 *             10.2:1 dark. Same rule as every other place brand becomes words.
 *
 *   inverted  `text-primary` — on `--deep` the relationship flips: the 500/400
 *             step is 6.7:1 light and 8.8:1 dark, while `--primary-text` drops
 *             to 3.05:1 because it is a DARK orange on a near-black ground.
 */
export function Logo({
  className = "",
  tone = "default",
}: {
  className?: string
  tone?: "default" | "inverted"
}) {
  const inverted = tone === "inverted"

  return (
    <span
      className={`font-display text-2xl leading-none font-bold tracking-[-0.03em] lg:text-[1.75rem] ${className}`}
    >
      <span className={inverted ? "text-deep-foreground" : "text-foreground"}>
        Daily
      </span>
      <span className={inverted ? "text-primary" : "text-primary-text"}>
        Bread
      </span>
    </span>
  )
}
