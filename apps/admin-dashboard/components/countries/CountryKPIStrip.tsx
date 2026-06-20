"use client"

import Link from "next/link"
import { Globe, CheckCircle2, XCircle, Store, MapPin, ShoppingBag, Users, TrendingUp } from "lucide-react"
import type { PlatformKPIResult } from "@/types/geography.types"

interface CountryKPIStripProps {
  kpis: PlatformKPIResult
}

interface KPICard {
  label:    string
  value:    string | number
  sub?:     string
  trend?:   { value: string; positive: boolean }
  icon:     React.ElementType
  variant:  "default" | "active" | "inactive" | "danger"
  href:     string
}

export function CountryKPIStrip({ kpis }: CountryKPIStripProps) {
  const cards: KPICard[] = [
    {
      label:   "Active Countries",
      value:   kpis.countries.active,
      sub:     `of ${kpis.countries.total} total`,
      trend:   { value: "+2 vs last month", positive: true },
      icon:    Globe,
      variant: "active",
      href:    "/countries",
    },
    {
      label:   "Total Cities",
      value:   kpis.cities.total.toLocaleString(),
      sub:     "across all countries",
      trend:   { value: "+8 vs last month", positive: true },
      icon:    MapPin,
      variant: "default",
      href:    "/cities",
    },
    {
      label:   "Total Vendors",
      value:   kpis.vendors.total.toLocaleString(),
      sub:     "across all countries",
      trend:   { value: "+12.4% vs last month", positive: true },
      icon:    Store,
      variant: "default",
      href:    "/vendors",
    },
    {
      label:   "Total Outlets",
      value:   kpis.outlets.total.toLocaleString(),
      sub:     `${kpis.outlets.active.toLocaleString()} active`,
      trend:   { value: "+15.7% vs last month", positive: true },
      icon:    ShoppingBag,
      variant: "default",
      href:    "/outlets",
    },
    {
      label:   "Customers",
      value:   kpis.customers.total.toLocaleString(),
      sub:     `${kpis.customers.active.toLocaleString()} active`,
      trend:   { value: "+18.3% vs last month", positive: true },
      icon:    Users,
      variant: "default",
      href:    "/customers",
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 mb-6">
      {cards.map(({ label, value, sub, trend, icon: Icon, variant, href }) => {
        const s = VARIANT_STYLES[variant]

        return (
          <Link
            key={label}
            href={href}
            className={[
              "group flex flex-col gap-3 rounded-xl border px-4 py-4",
              "cursor-pointer outline-none",
              "transition-all duration-200",
              "hover:-translate-y-0.5",
              "focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-1",
            ].join(" ")}
            style={{
              backgroundColor: s.cardBg,
              borderColor:     s.borderColor,
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget
              el.style.borderColor = s.hoverBorderColor
              el.style.boxShadow   = "var(--shadow-md)"
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget
              el.style.borderColor = s.borderColor
              el.style.boxShadow   = ""
            }}
          >
            {/* Icon row */}
            <div className="flex items-start justify-between">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-lg"
                style={{ backgroundColor: s.iconBg }}
              >
                <Icon className="h-4 w-4" style={{ color: s.iconColor }} />
              </div>
            </div>

            {/* Value + label */}
            <div>
              <p
                className="font-display text-2xl font-semibold tabular-nums leading-none tracking-tight"
                style={{ color: s.valueColor }}
              >
                {value}
              </p>
              <p
                className="mt-1 text-xs font-medium leading-tight"
                style={{ color: s.labelColor }}
              >
                {label}
              </p>
              {sub && (
                <p
                  className="mt-0.5 text-[11px] leading-tight tabular-nums"
                  style={{ color: s.subColor }}
                >
                  {sub}
                </p>
              )}
            </div>

            {/* Trend */}
            {trend && (
              <div className="flex items-center gap-1">
                <TrendingUp
                  className="h-3 w-3 shrink-0"
                  style={{ color: trend.positive ? "var(--success)" : "var(--destructive)" }}
                />
                <span
                  className="text-[11px] font-medium"
                  style={{ color: trend.positive ? "var(--success)" : "var(--destructive)" }}
                >
                  {trend.value}
                </span>
              </div>
            )}
          </Link>
        )
      })}
    </div>
  )
}


const VARIANT_STYLES = {
  default: {
    cardBg:           "var(--card)",
    borderColor:      "var(--border)",
    hoverBorderColor: "color-mix(in oklch, var(--primary) 28%, var(--border))",
    iconBg:           "var(--icon-bg)",
    iconColor:        "var(--icon-fg)",
    valueColor:       "var(--foreground)",
    labelColor:       "var(--muted-foreground)",
    subColor:         "var(--muted-foreground)",
  },
  active: {
    cardBg:           "color-mix(in oklch, var(--primary) 8%, var(--card))",
    borderColor:      "color-mix(in oklch, var(--primary) 25%, var(--border))",
    hoverBorderColor: "color-mix(in oklch, var(--primary) 55%, var(--border))",
    iconBg:           "color-mix(in oklch, var(--primary) 15%, transparent)",
    iconColor:        "var(--primary)",
    valueColor:       "var(--primary)",
    labelColor:       "var(--primary)",
    subColor:         "color-mix(in oklch, var(--primary) 70%, transparent)",
  },
  inactive: {
    cardBg:           "var(--card)",
    borderColor:      "var(--border)",
    hoverBorderColor: "color-mix(in oklch, var(--muted-foreground) 40%, var(--border))",
    iconBg:           "var(--muted)",
    iconColor:        "var(--muted-foreground)",
    valueColor:       "var(--foreground)",
    labelColor:       "var(--muted-foreground)",
    subColor:         "var(--muted-foreground)",
  },
  danger: {
    cardBg:           "var(--destructive-bg)",
    borderColor:      "color-mix(in oklch, var(--destructive) 30%, var(--border))",
    hoverBorderColor: "color-mix(in oklch, var(--destructive) 60%, var(--border))",
    iconBg:           "color-mix(in oklch, var(--destructive) 15%, transparent)",
    iconColor:        "var(--destructive)",
    valueColor:       "var(--destructive)",
    labelColor:       "var(--destructive)",
    subColor:         "color-mix(in oklch, var(--destructive) 70%, transparent)",
  },
} as const