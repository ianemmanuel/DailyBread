import type { LucideIcon } from "lucide-react"
import Link from "next/link"

export default function SectionTitle({
  icon: Icon,
  label,
  href,
}: {
  icon: LucideIcon
  label: string
  href?: string
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div
          className="flex h-7 w-7 items-center justify-center rounded-lg"
          style={{ backgroundColor: "var(--icon-bg)" }}
        >
          <Icon
            className="h-3.5 w-3.5"
            style={{ color: "var(--icon-fg)" }}
          />
        </div>

        <h2
          className="text-sm font-semibold tracking-tight"
          style={{
            color: "var(--foreground)",
            fontFamily: "var(--font-sans)",
          }}
        >
          {label}
        </h2>
      </div>

      {href && (
        <Link
          href={href}
          className="text-xs font-medium transition-colors duration-150"
          style={{ color: "var(--primary)" }}
        >
          View all →
        </Link>
      )}
    </div>
  )
}
