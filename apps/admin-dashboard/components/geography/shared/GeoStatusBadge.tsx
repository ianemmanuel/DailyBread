// components/geography/shared/GeoStatusBadge.tsx
import type { GeoStatus } from "@repo/types/admin-app"
import { cn } from "@repo/ui/lib/utils"

interface Props { status: GeoStatus; className?: string }

export function GeoStatusBadge({ status, className }: Props) {
  const isActive = status === "ACTIVE"
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        isActive
          ? "bg-[var(--color-success-muted)] text-[var(--color-success)]"
          : "bg-[var(--muted)] text-[var(--muted-foreground)]",
        className,
      )}
    >
        <span
            className={cn(
                "size-1.5 rounded-full",
                isActive ? "bg-[var(--color-success)]" : "bg-[var(--muted-foreground)]",
            )}
        />
        {isActive ? "Active" : "Inactive"}
    </span>
  )
}
