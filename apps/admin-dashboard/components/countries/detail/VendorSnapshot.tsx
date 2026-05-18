import { TrendingUp, AlertTriangle, Star } from "lucide-react"
import type { VendorStats } from "@/types/geography.types"

interface CountryVendorSnapshotProps {
  stats: VendorStats
}

export function CountryVendorSnapshot({ stats }: CountryVendorSnapshotProps) {
  const maxCount = Math.max(...stats.byType.map((t) => t.count))

  return (
    <div
      className="rounded-xl border p-5 space-y-4"
      style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
    >
      {/* By type */}
      <div className="space-y-2.5">
        {stats.byType.map(({ type, count }) => (
          <div key={type} className="flex items-center gap-3">
            <span
              className="w-28 shrink-0 text-xs font-medium truncate"
              style={{ color: "var(--foreground)" }}
            >
              {type}
            </span>
            <div
              className="flex-1 h-1.5 overflow-hidden rounded-full"
              style={{ backgroundColor: "var(--muted)" }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(count / maxCount) * 100}%`,
                  backgroundColor: "var(--primary)",
                  opacity: 0.8,
                }}
              />
            </div>
            <span
              className="w-8 text-right tabular-nums text-xs font-semibold"
              style={{ color: "var(--foreground)" }}
            >
              {count}
            </span>
          </div>
        ))}
      </div>

      {/* Summary chips */}
      <div
        className="flex flex-wrap items-center gap-2 border-t pt-4"
        style={{ borderColor: "var(--border)" }}
      >
        <Chip
          icon={TrendingUp}
          label={`+${stats.recentCount} this month`}
          color="success"
        />
        <Chip
          icon={AlertTriangle}
          label={`${stats.suspended} suspended`}
          color="warning"
        />
        <Chip
          icon={Star}
          label={stats.topPerformer}
          color="primary"
        />
      </div>
    </div>
  )
}

function Chip({
  icon: Icon,
  label,
  color,
}: {
  icon:  React.ElementType
  label: string
  color: "success" | "warning" | "primary"
}) {
  const colorMap = {
    success: { bg: "var(--success-bg)",     fg: "var(--success)"     },
    warning: { bg: "var(--warning-bg)",     fg: "var(--warning)"     },
    primary: { bg: "color-mix(in oklch, var(--primary) 10%, transparent)", fg: "var(--primary)" },
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
      style={{ backgroundColor: colorMap[color].bg, color: colorMap[color].fg }}
    >
      <Icon className="h-3 w-3" />
      {label}
    </span>
  )
}