import Link                   from "next/link"
import { AlertTriangle, Info, XCircle, ArrowRight } from "lucide-react"
import type { InsightItem }   from "@/types/geography.types"

interface CountryInsightsProps {
  items: InsightItem[]
}

const typeConfig = {
  danger:  {
    icon:        XCircle,
    iconColor:   "var(--destructive)",
    iconBg:      "var(--destructive-bg)",
    borderLeft:  "var(--destructive)",
    labelColor:  "var(--destructive)",
    label:       "Action required",
  },
  warning: {
    icon:        AlertTriangle,
    iconColor:   "var(--warning)",
    iconBg:      "var(--warning-bg)",
    borderLeft:  "var(--warning)",
    labelColor:  "var(--warning)",
    label:       "Attention needed",
  },
  info: {
    icon:        Info,
    iconColor:   "var(--info)",
    iconBg:      "var(--info-bg)",
    borderLeft:  "var(--primary)",
    labelColor:  "var(--primary)",
    label:       "Insight",
  },
} as const

export function CountryInsights({ items }: CountryInsightsProps) {
  if (items.length === 0) {
    return (
      <div
        className="flex items-center gap-3 rounded-xl border px-5 py-4"
        style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
      >
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: "var(--success-bg)" }}
        >
          <Info className="h-3.5 w-3.5" style={{ color: "var(--success)" }} />
        </div>
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          No active risk signals — all countries are operating within expected parameters.
        </p>
      </div>
    )
  }

  return (
    <div
      className="overflow-hidden rounded-xl border"
      style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
    >
      <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
        {items.map((item) => {
          const cfg = typeConfig[item.type]
          const Icon = cfg.icon

          return (
            <li
              key={item.id}
              className="flex items-start gap-4 px-5 py-4"
              style={{
                borderColor: "var(--border)",
                borderLeft:  `3px solid ${cfg.borderLeft}`,
              }}
            >
              {/* Icon */}
              <div
                className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: cfg.iconBg }}
              >
                <Icon className="h-3.5 w-3.5" style={{ color: cfg.iconColor }} />
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="text-[10px] font-semibold uppercase tracking-wider"
                    style={{ color: cfg.labelColor }}
                  >
                    {cfg.label}
                  </span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                    style={{ backgroundColor: "var(--muted)", color: "var(--foreground)" }}
                  >
                    {item.country}
                  </span>
                </div>
                <p
                  className="mt-1 text-xs leading-relaxed"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {item.message}
                </p>
              </div>

              {/* Link */}
              <Link
                href={`/countries/${item.slug}`}
                className="mt-0.5 flex shrink-0 items-center gap-1 text-xs font-medium transition-colors duration-150"
                style={{ color: "var(--primary)" }}
              >
                View
                <ArrowRight className="h-3 w-3" />
              </Link>
            </li>
          )
        })}
      </ul>

      {/* Footer */}
      <div
        className="flex items-center justify-between border-t px-5 py-3"
        style={{ borderColor: "var(--border)" }}
      >
        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          {items.filter((i) => i.type === "danger").length > 0 && (
            <span style={{ color: "var(--destructive)", fontWeight: 600 }}>
              {items.filter((i) => i.type === "danger").length} critical ·{" "}
            </span>
          )}
          {items.filter((i) => i.type === "warning").length} warnings ·{" "}
          {items.filter((i) => i.type === "info").length} insights
        </p>
        <Link
          href="/reports/compliance"
          className="text-xs font-medium transition-colors duration-150"
          style={{ color: "var(--primary)" }}
        >
          Full compliance report →
        </Link>
      </div>
    </div>
  )
}