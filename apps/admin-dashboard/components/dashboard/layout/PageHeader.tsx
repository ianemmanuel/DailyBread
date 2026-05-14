import { ReactNode } from "react"
import { cn } from "@repo/ui/lib/utils"

interface PageHeaderProps {
  title: string
  
  description?: string
  
  /**
   * Optional action buttons or elements aligned to the right
   */
  actions?: ReactNode
  
  /**
   * Optional breadcrumb component
   */
  breadcrumb?: ReactNode
  
  /**
   * Optional icon to display before the title
   */
  icon?: React.ElementType
  
  /**
   * Additional className for the header container
   */
  className?: string
  
  /**
   * Whether to show a divider line below the header
   * @default false
   */
  divider?: boolean
}

/**
 * PageHeader — Minimalist, clean header for dashboard pages.
 * 
 * Features:
 * - Responsive: stacks on mobile, row on desktop
 * - Consistent spacing that aligns with dashboard grid
 * - Optional description text with subtle styling
 * - Optional actions area (buttons, filters, etc.)
 * - Optional breadcrumb navigation
 * 
 * Usage:
 * ```tsx
 * <PageHeader 
 *   title="Cities"
 *   description="Manage delivery zones and city configurations"
 *   actions={<Button>Add City</Button>}
 * />
 * ```
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
    <div className={cn("space-y-4", className)}>
      {/* Breadcrumb (if provided) */}
      {breadcrumb && (
        <div className="text-sm">
          {breadcrumb}
        </div>
      )}

      {/* Main header row */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        {/* Left side: Icon + Title + Description */}
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-center gap-3">
            {Icon && (
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                style={{
                  backgroundColor: "color-mix(in oklch, var(--primary) 10%, transparent)",
                }}
              >
                <Icon className="h-4 w-4" style={{ color: "var(--primary)" }} />
              </div>
            )}
            <h1
              className="font-display text-2xl font-semibold tracking-tight sm:text-3xl"
              style={{ color: "var(--foreground)" }}
            >
              {title}
            </h1>
          </div>
          
          {description && (
            <p
              className="text-sm leading-relaxed sm:text-base"
              style={{ color: "var(--muted-foreground)" }}
            >
              {description}
            </p>
          )}
        </div>

        {/* Right side: Actions */}
        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        )}
      </div>

      {/* Divider */}
      {divider && (
        <div
          className="h-px w-full pt-4"
          style={{ backgroundColor: "var(--border)" }}
        />
      )}
    </div>
  )
}