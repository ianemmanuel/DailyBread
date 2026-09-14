"use client"

import * as React from "react"
import type { StorefrontSection } from "@repo/types/customer-app"

/*
 * The sticky section rail on a long menu.
 *
 * Client-side for one reason only: highlighting which section you are currently
 * looking at. The links themselves are plain anchors that work without any
 * JavaScript at all — if this never hydrates, the rail still navigates.
 *
 * IntersectionObserver rather than a scroll listener, because a scroll handler
 * fires on every frame and would have to be throttled; the observer only fires
 * when a section actually crosses the threshold.
 *
 * The root margin is the interesting part: `-40% 0px -55%` narrows the viewport
 * to a band around the upper-middle of the screen, so "current" means the
 * section you are reading rather than whichever one happens to touch the very
 * top or bottom edge.
 */
export function MenuSectionRail({ sections }: { sections: StorefrontSection[] }) {
  const [active, setActive] = React.useState(sections[0]?.id ?? null)
  const railRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((entry) => entry.isIntersecting)
        if (visible) setActive(visible.target.id.replace("section-", ""))
      },
      { rootMargin: "-40% 0px -55% 0px", threshold: 0 },
    )

    for (const section of sections) {
      const element = document.getElementById(`section-${section.id}`)
      if (element) observer.observe(element)
    }
    return () => observer.disconnect()
  }, [sections])

  /* Keep the active chip in view on a phone, where the rail scrolls sideways —
   * otherwise the highlight moves somewhere the customer cannot see. `nearest`
   * so it never yanks the rail when the chip is already visible. */
  React.useEffect(() => {
    if (!active || !railRef.current) return
    railRef.current
      .querySelector(`[data-section="${active}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" })
  }, [active])

  return (
    <div className="sticky top-16 z-30 -mx-4 bg-[var(--background)]/90 px-4 py-2.5 backdrop-blur-md sm:-mx-6 sm:px-6">
      <div ref={railRef} className="rail" role="navigation" aria-label="Menu sections">
        {sections.map((section) => {
          const on = active === section.id
          return (
            <a
              key={section.id}
              href={`#section-${section.id}`}
              data-section={section.id}
              aria-current={on ? "true" : undefined}
              className={`shrink-0 cursor-pointer rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                on
                  ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                  : "bg-[var(--card)] text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              {section.name}
            </a>
          )
        })}
      </div>
    </div>
  )
}
