"use client"

import Link from "next/link"
import {
  Globe,
  Store,
  MapPin,
  ShoppingBag,
  Users,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { KPIResult, KPITrend } from "@repo/types/admin-app"


interface CountryKPIStripProps {
  kpis: KPIResult
}


export interface KPICard {
  label:   string
  value:   string | number
  sub?:    string
  trend?:  KPITrend
  icon:    React.ElementType
  variant: "brand" | "default"
  href:    string
}
/**
 * Renders a live trend pill.
 *
 * direction = "up"   → green TrendingUp   + "+N (X%)"
 * direction = "down" → red TrendingDown   + "−N (X%)"
 * direction = "flat" → muted Minus        + "No change this month"
 */
function TrendPill({ trend }: { trend: KPITrend }) {
  if (trend.direction === "flat") {
    return (
      <div className="flex items-center gap-1">
        <Minus className="h-3 w-3 shrink-0 text-muted-foreground" />
        <span className="text-[11px] font-medium text-muted-foreground">
          No change this month
        </span>
      </div>
    )
  }

  const isUp     = trend.direction === "up"
  const Icon     = isUp ? TrendingUp : TrendingDown
  const colorCls = isUp ? "text-success" : "text-destructive"
  const sign     = isUp ? "+" : ""
  const pctSign  = trend.deltaPercent >= 0 ? "+" : ""

  return (
    <div className="flex items-center gap-1">
      <Icon className={cn("h-3 w-3 shrink-0", colorCls)} />
      <span className={cn("text-[11px] font-medium", colorCls)}>
        {sign}{trend.delta} ({pctSign}{trend.deltaPercent}%) this month
      </span>
    </div>
  )
}

export function CountryKPIStrip({ kpis }: CountryKPIStripProps) {
  const cards: KPICard[] = [
    {
      label:   "Active Countries",
      value:   kpis.countries.active,
      sub:     `of ${kpis.countries.total} total`,
      trend:   kpis.countries.trend.active,
      icon:    Globe,
      variant: "brand",
      href:    "/countries",
    },
    {
      label:   "Total Cities",
      value:   kpis.cities.total.toLocaleString(),
      sub:     `${kpis.cities.active.toLocaleString()} active`,
      trend:   kpis.cities.trend.total,
      icon:    MapPin,
      variant: "default",
      href:    "/cities",
    },
    {
      label:   "Total Vendors",
      value:   kpis.vendors.total.toLocaleString(),
      sub:     `${kpis.vendors.pendingApplications} pending review`,
      trend:   kpis.vendors.trend.totalVendors,
      icon:    Store,
      variant: "default",
      href:    "/vendors",
    },
    {
      label:   "Total Outlets",
      value:   kpis.outlets.total.toLocaleString(),
      sub:     `${kpis.outlets.active.toLocaleString()} active`,
      trend:   kpis.outlets.trend.total,
      icon:    ShoppingBag,
      variant: "default",
      href:    "/outlets",
    },
    {
      label:   "Customers",
      value:   kpis.customers.total.toLocaleString(),
      sub:     `${kpis.customers.active.toLocaleString()} active`,
      trend:   kpis.customers.trend.total,
      icon:    Users,
      variant: "default",
      href:    "/customers",
    },
  ]

  return (
    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map(({ label, value, sub, trend, icon: Icon, variant, href }) => {
        const isBrand = variant === "brand"

        return (
          <Link
            key={label}
            href={href}
            className={cn(
              "group flex flex-col gap-3 rounded-xl border px-4 py-4",
              "outline-none transition-all duration-200",
              "hover:-translate-y-0.5 hover:shadow-md",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              isBrand
                ? "border-primary/25 bg-primary/8"
                : "border-border bg-card hover:border-primary/20",
            )}
          >
            {/* Icon */}
            <div
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-lg",
                isBrand ? "bg-primary/15" : "bg-icon-bg",
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4",
                  isBrand ? "text-primary" : "text-icon-fg",
                )}
              />
            </div>

            {/* Value + label */}
            <div>
              <p
                className={cn(
                  "font-display text-2xl font-semibold tabular-nums leading-none tracking-tight",
                  isBrand ? "text-primary" : "text-foreground",
                )}
              >
                {value}
              </p>
              <p
                className={cn(
                  "mt-1 text-xs font-medium leading-tight",
                  isBrand ? "text-primary" : "text-muted-foreground",
                )}
              >
                {label}
              </p>
              {sub && (
                <p
                  className={cn(
                    "mt-0.5 text-[11px] leading-tight tabular-nums",
                    isBrand ? "text-primary/70" : "text-muted-foreground",
                  )}
                >
                  {sub}
                </p>
              )}
            </div>

            {/* Live trend */}
            {trend && <TrendPill trend={trend} />}
          </Link>
        )
      })}
    </div>
  )
}