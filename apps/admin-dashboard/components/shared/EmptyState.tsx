import Link from "next/link"
import type { LucideIcon } from "lucide-react"
import { Button } from "@repo/ui/components/button"

interface EmptyStateProps {
  icon:          LucideIcon
  title:         string
  description:   string
  actionLabel?:  string
  actionHref?:   string
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionHref,
}: EmptyStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-4 rounded-xl border px-6 py-16 text-center"
      style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
    >
      <div
        className="flex h-12 w-12 items-center justify-center rounded-full"
        style={{ backgroundColor: "var(--muted)" }}
      >
        <Icon className="h-5 w-5" style={{ color: "var(--muted-foreground)" }} />
      </div>

      <div className="max-w-sm space-y-1">
        <p className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
          {title}
        </p>
        <p className="text-xs leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
          {description}
        </p>
      </div>

      {actionLabel && actionHref && (
        <Link href={actionHref}>
          <Button variant="outline" size="sm" className="h-8 text-xs">
            {actionLabel}
          </Button>
        </Link>
      )}
    </div>
  )
}