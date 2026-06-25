"use client"

import Link from "next/link"
import {
  Globe,
  Store,
  MapPin,
  ShoppingBag,
  DollarSign,
  TrendingUp,
  TrendingDown,
} from "lucide-react"
import { cn } from "@/lib/utils"
import type { PlatformKPIResult, KPICard } from "@/types/country.types"

interface CountryKPIStripProps {
  kpis: PlatformKPIResult
}


export function CountryKPIStrip({ kpis }: CountryKPIStripProps) {
  const cards: KPICard[] = [
    {
      label:   "Active Countries",
      value:   kpis.countries.active,
      sub:     `of ${kpis.countries.total} total`,
      trend:   { value: "+2 vs last month", positive: true },
      icon:    Globe,
      variant: "brand",
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
      label:   "Total Orders (30d)",
      value:   kpis.outlets?.total.toLocaleString() ?? "1.24M",
      sub:     "across all countries",
      trend:   { value: "+15.7% vs last month", positive: true },
      icon:    ShoppingBag,
      variant: "default",
      href:    "/orders",
    },
    {
      label:   "GMV (30d)",
      value:   kpis.customers?.total.toLocaleString() ?? "KES 128.6M",
      sub:     "across all countries",
      trend:   { value: "+18.3% vs last month", positive: true },
      icon:    DollarSign,
      variant: "default",
      href:    "/reports",
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

            {/* Trend */}
            {trend && (
              <div className="flex items-center gap-1">
                {trend.positive ? (
                  <TrendingUp className="h-3 w-3 shrink-0 text-success" />
                ) : (
                  <TrendingDown className="h-3 w-3 shrink-0 text-destructive" />
                )}
                <span
                  className={cn(
                    "text-[11px] font-medium",
                    trend.positive ? "text-success" : "text-destructive",
                  )}
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