import { SERVICE_AREA_MODE_CONFIG } from "@/types/geography.types"
import { ServiceAreaMode } from "@repo/types/admin-app"
import { cn } from "@repo/ui/lib/utils"

interface Props {
  mode     : ServiceAreaMode
  className?: string
}

export function ModeBadge({ mode, className }: Props) {
  const cfg = SERVICE_AREA_MODE_CONFIG[mode]

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        className,
      )}
      style={{
        backgroundColor: cfg.fillColor,
        color          : cfg.color,
        border         : `1px solid ${cfg.color}40`,
      }}
    >
      <span
        className="size-1.5 rounded-full shrink-0"
        style={{ backgroundColor: cfg.color }}
      />
      {cfg.label}
    </span>
  )
}