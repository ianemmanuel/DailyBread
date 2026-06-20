import { type ReactNode } from "react"
import { cn } from "@repo/ui/lib/utils"

interface PageHeaderProps {
  title:        string
  description?: string
  actions?:     ReactNode
  breadcrumb?:  ReactNode
  icon?:        React.ElementType
  className?:   string
  divider?:     boolean
}

/**
 * PageHeader — shared across all dashboard pages.
 *
 * Left: optional icon pill + h1 title + description.
 * Right: optional actions slot (buttons, dropdowns, etc.)
 * Optional breadcrumb row above.
 * Optional divider below.
 */
export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
  icon: Icon,
  className,
  divider = false,
}: PageHeaderProps) {
  return (
    <div className={cn("space-y-3 pb-2", className)}>
      {breadcrumb && (
        <div className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          {breadcrumb}
        </div>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        {/* Left: icon + title + description */}
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {Icon && (
            <div
              className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{
                backgroundColor: "color-mix(in oklch, var(--primary) 12%, transparent)",
                border: "1px solid color-mix(in oklch, var(--primary) 25%, transparent)",
              }}
            >
              <Icon className="h-5 w-5" style={{ color: "var(--primary)" }} />
            </div>
          )}
          <div className="min-w-0">
            <h1
              className="font-display text-2xl font-semibold tracking-tight sm:text-3xl"
              style={{ color: "var(--foreground)" }}
            >
              {title}
            </h1>
            {description && (
              <p
                className="mt-1 text-sm leading-relaxed"
                style={{ color: "var(--muted-foreground)" }}
              >
                {description}
              </p>
            )}
          </div>
        </div>

        {/* Right: actions */}
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        )}
      </div>

      {divider && (
        <div
          className="mt-2 h-px w-full"
          style={{ backgroundColor: "var(--border)" }}
        />
      )}
    </div>
  )
}