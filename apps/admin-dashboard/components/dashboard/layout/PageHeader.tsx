import { PageHeaderProps } from "@/types"
import { cn } from "@repo/ui/lib/utils"

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
    <div className={cn("pb-6", className)}>
      {breadcrumb && (
        <div className="mb-3 text-sm text-muted-foreground">{breadcrumb}</div>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Left: icon + title + description */}
        <div className="flex min-w-0 flex-1 items-center gap-4">
          {Icon && (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
              <Icon className="h-6 w-6 text-primary" />
            </div>
          )}

          <div className="min-w-0">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              {title}
            </h1>
            {description && (
              <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
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

      {divider && <div className="mt-4 h-px w-full bg-border" />}
    </div>
  )
}