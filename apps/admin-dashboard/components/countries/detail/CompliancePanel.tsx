import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react"
import type { ComplianceItem } from "@/types/geography.types"

interface CountryCompliancePanelProps {
  items: ComplianceItem[]
}

const statusConfig = {
  OK:      { icon: CheckCircle2, color: "var(--success)",     bg: "var(--success-bg)"     },
  WARNING: { icon: AlertTriangle,color: "var(--warning)",     bg: "var(--warning-bg)"     },
  EXPIRED: { icon: XCircle,      color: "var(--destructive)", bg: "var(--destructive-bg)" },
}

export function CountryCompliancePanel({ items }: CountryCompliancePanelProps) {
  const expiredCount = items.filter((i) => i.status === "EXPIRED").length
  const warningCount = items.filter((i) => i.status === "WARNING").length

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
    >
      {/* Alert banner if issues exist */}
      {(expiredCount > 0 || warningCount > 0) && (
        <div
          className="flex items-center gap-2 border-b px-5 py-2.5 text-xs font-medium"
          style={{
            backgroundColor: expiredCount > 0 ? "var(--destructive-bg)" : "var(--warning-bg)",
            borderColor:     expiredCount > 0 ? "var(--destructive)"    : "var(--warning)",
            color:           expiredCount > 0 ? "var(--destructive)"    : "var(--warning)",
          }}
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {expiredCount > 0
            ? `${expiredCount} expired item${expiredCount > 1 ? "s" : ""} require immediate attention`
            : `${warningCount} item${warningCount > 1 ? "s" : ""} expiring soon`
          }
        </div>
      )}

      {/* Items */}
      <ul className="divide-y" style={{ "--tw-divide-opacity": 1 } as React.CSSProperties}>
        {items.map((item) => {
          const { icon: Icon, color, bg } = statusConfig[item.status] 

          return (
            <li
              key={item.id}
              className="flex items-start gap-3 px-5 py-3.5"
              style={{ borderColor: "var(--border)" }}
            >
              {/* Status icon */}
              <div
                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: bg }}
              >
                <Icon className="h-3.5 w-3.5" style={{ color }} />
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1 space-y-0.5">
                <p
                  className="text-xs font-semibold leading-tight"
                  style={{ color: "var(--foreground)" }}
                >
                  {item.label}
                </p>
                {item.note && (
                  <p className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>
                    {item.note}
                  </p>
                )}
                {item.dueDate && (
                  <p
                    className="text-[11px] font-medium"
                    style={{ color }}
                  >
                    Due {new Date(item.dueDate).toLocaleDateString("en-GB", {
                      day: "numeric", month: "short", year: "numeric"
                    })}
                  </p>
                )}
              </div>

              {/* Status label */}
              <span
                className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                style={{ backgroundColor: bg, color }}
              >
                {item.status}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}