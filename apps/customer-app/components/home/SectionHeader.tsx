import Link from "next/link"
import { ArrowRight } from "lucide-react"

/* The title row shared by the landing sections: a serif heading, and an
 * optional "See all" link on the right. */
export function SectionHeader({
  id,
  title,
  href,
  linkLabel = "See all",
}: {
  id: string
  title: string
  href?: string
  linkLabel?: string
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4 sm:mb-8">
      <h2 id={id} className="heading-lg">
        {title}
      </h2>
      {href && (
        <Link
          href={href}
          className="group inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-primary-text"
        >
          {linkLabel}
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </Link>
      )}
    </div>
  )
}
