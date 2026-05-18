"use client"
import Link from "next/link"
import {
  Globe,
  CheckCircle2,
  XCircle,
  Store,
  MapPin,
  ShoppingBag,
  Users,
} from "lucide-react"
import type { PlatformKPIResult } from "@/types/geography.types"

interface CountryKPIStripProps {
  kpis: PlatformKPIResult
}

interface KPICard {
  label:    string
  value:    string | number
  sub?:     string
  icon:     React.ElementType
  variant:  "default" | "active" | "inactive" | "danger"
  href:     string
}

export function CountryKPIStrip({ kpis }: CountryKPIStripProps) {
  const cards: KPICard[] = [
    {
      label:   "Total Countries",
      value:   kpis.countries.total,
      sub:     "all markets",
      icon:    Globe,
      variant: "default",
      href:    "/countries/all",
    },
    {
      label:   "Active",
      value:   kpis.countries.active,
      sub:     "operational",
      icon:    CheckCircle2,
      variant: "active",
      href:    "/countries",
    },
    {
      label:   "Inactive",
      value:   kpis.countries.inactive,
      sub:     "deactivated",
      icon:    XCircle,
      variant: kpis.countries.inactive > 0 ? "inactive" : "default",
      href:    "/countries/inactive",
    },
    {
      label:   "Vendors",
      value:   kpis.vendors.total.toLocaleString(),
      sub:     `${kpis.vendors.active.toLocaleString()} active`,
      icon:    Store,
      variant: "default",
      href:    "/vendors",
    },
    {
      label:   "Cities",
      value:   kpis.cities.total.toLocaleString(),
      sub:     `${kpis.cities.active.toLocaleString()} active`,
      icon:    MapPin,
      variant: "default",
      href:    "/cities",
    },
    {
      label:   "Outlets",
      value:   kpis.outlets.total.toLocaleString(),
      sub:     `${kpis.outlets.active.toLocaleString()} active`,
      icon:    ShoppingBag,
      variant: "default",
      href:    "/outlets",
    },
    {
      label:   "Customers",
      value:   kpis.customers.total.toLocaleString(),
      sub:     `${kpis.customers.active.toLocaleString()} active`,
      icon:    Users,
      variant: "default",
      href:    "/customers",
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
      {cards.map(({ label, value, sub, icon: Icon, variant, href }) => {
        const s = VARIANT_STYLES[variant]

        return (
          <Link
            key={label}
            href={href}
            className={[
              "group flex flex-col justify-between gap-4 rounded-xl border px-4 py-4",
              "cursor-pointer outline-none",
              "transition-all duration-200",
              "hover:-translate-y-0.5 hover:shadow-md",
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
            {/* Icon */}
            <div
              className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors duration-200"
              style={{ backgroundColor: s.iconBg }}
            >
              <Icon className="h-3.5 w-3.5" style={{ color: s.iconColor }} />
            </div>

            {/* Value + label */}
            <div>
              <p
                className="font-display text-2xl font-semibold tabular-nums leading-none tracking-tight transition-colors duration-200"
                style={{ color: s.valueColor }}
              >
                {value}
              </p>
              <p
                className="mt-1 text-[11px] font-medium leading-tight"
                style={{ color: s.labelColor }}
              >
                {label}
              </p>
              {sub && (
                <p
                  className="mt-0.5 text-[10px] leading-tight tabular-nums"
                  style={{ color: s.subColor }}
                >
                  {sub}
                </p>
              )}
            </div>
          </Link>
        )
      })}
    </div>
  )
}

//* Variant styles

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
    cardBg:           "color-mix(in oklch, var(--primary) 6%, var(--card))",
    borderColor:      "color-mix(in oklch, var(--primary) 22%, var(--border))",
    hoverBorderColor: "color-mix(in oklch, var(--primary) 50%, var(--border))",
    iconBg:           "color-mix(in oklch, var(--primary) 12%, transparent)",
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