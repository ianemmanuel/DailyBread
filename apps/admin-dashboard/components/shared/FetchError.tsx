import { AlertTriangle, RefreshCw } from "lucide-react"
import { cn } from "@repo/ui/lib/utils"
import { Button } from "@/components/ui/button"

interface FetchErrorProps {
  /** Short description of what failed — shown as the subtitle. */
  message: string
  /** The section or resource that failed, e.g. "platform metrics". */
  context?: string
  /** Optional retry handler. Renders a Retry button when provided. */
  onRetry?: () => void
  /**
   * Visual weight:
   * - "banner"  — full-width strip (default, used in page-level sections)
   * - "inline"  — compact pill, good for small card slots or table cells
   */
  variant?: "banner" | "inline"
  className?: string
}

export function FetchError({
  message,
  context,
  onRetry,
  variant = "banner",
  className,
}: FetchErrorProps) {
  const title = context ? `Couldn't load ${context}` : "Something went wrong"

  if (variant === "inline") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border border-destructive/20",
          "bg-destructive-bg px-2.5 py-1 text-xs font-medium text-destructive",
          className,
        )}
      >
        <AlertTriangle className="h-3 w-3 shrink-0" />
        {title}
      </span>
    )
  }

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive-bg px-5 py-4",
        className,
      )}
    >
      {/* Icon */}
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-destructive">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          {message}
        </p>
      </div>

      {/* Optional retry */}
      {onRetry && (
        <Button
          onClick={onRetry}
          className={cn(
            "mt-0.5 flex shrink-0 items-center gap-1.5 rounded-lg border border-destructive/25",
            "bg-destructive/8 px-3 py-1.5 text-xs font-medium text-destructive",
            "transition-colors hover:bg-destructive/15 focus-visible:outline-none",
            "focus-visible:ring-2 focus-visible:ring-destructive/50",
          )}
        >
          <RefreshCw className="h-3 w-3" />
          Retry
        </Button>
      )}
    </div>
  )
}