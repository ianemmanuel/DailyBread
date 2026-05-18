"use client"

import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  MapPin,
  Store,
  ArrowRight,
  ShieldCheck,
  BarChart2,
} from "lucide-react"
import { GeoStatusBadge } from "@/components/geography/shared/GeoStatusBadge"
import type { CountrySummaryResult } from "@/types/geography.types"

interface CountryCardProps {
  country: CountrySummaryResult
}

export function CountryCard({ country }: CountryCardProps) {
  const router      = useRouter()
  const cityCount   = country._count?.cities  ?? 0
  const vendorCount = country._count?.vendors ?? 0

  return (
    <div
      className="group flex flex-col rounded-xl border transition-all duration-200 hover:-translate-y-0.5"
      style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLDivElement
        el.style.borderColor = "color-mix(in oklch, var(--primary) 35%, var(--border))"
        el.style.boxShadow   = "var(--shadow-md)"
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLDivElement
        el.style.borderColor = "var(--border)"
        el.style.boxShadow   = ""
      }}
    >
      {/* Main clickable body */}
      <button
        type="button"
        onClick={() => router.push(`/countries/${country.slug}`)}
        className="flex flex-1 flex-col gap-4 p-5 text-left cursor-pointer"
        aria-label={`Open ${country.name} dashboard`}
      >
        {/* Top row: code badge + status */}
        <div className="flex items-start justify-between gap-3">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-base font-bold tracking-wide"
            style={{
              backgroundColor: "color-mix(in oklch, var(--primary) 10%, transparent)",
              color:           "var(--primary)",
              fontFamily:      "var(--font-display)",
            }}
          >
            {country.code}
          </div>
          <GeoStatusBadge status={country.status as "ACTIVE" | "INACTIVE"} />
        </div>

        {/* Country name + currency */}
        <div>
          <h3
            className="text-base font-semibold leading-snug tracking-tight"
            style={{ color: "var(--foreground)", fontFamily: "var(--font-display)" }}
          >
            {country.name}
          </h3>
          {country.currency && (
            <p className="mt-0.5 text-xs" style={{ color: "var(--muted-foreground)" }}>
              {country.currency}
              {country.phoneCode ? ` · ${country.phoneCode}` : ""}
            </p>
          )}
        </div>

        {/* Stats row */}
        <div
          className="flex items-center gap-4 border-t pt-3 text-xs"
          style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}
        >
          <span className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span>
              <strong className="font-semibold tabular-nums" style={{ color: "var(--foreground)" }}>
                {cityCount}
              </strong>{" "}
              {cityCount === 1 ? "city" : "cities"}
            </span>
          </span>

          <span className="flex items-center gap-1.5">
            <Store className="h-3.5 w-3.5 shrink-0" />
            <span>
              <strong className="font-semibold tabular-nums" style={{ color: "var(--foreground)" }}>
                {vendorCount.toLocaleString()}
              </strong>{" "}
              {vendorCount === 1 ? "vendor" : "vendors"}
            </span>
          </span>

          {/* Arrow — slides in on group hover */}
          <span
            className="ml-auto flex items-center gap-1 font-medium -translate-x-1 opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100"
            style={{ color: "var(--primary)" }}
          >
            Open
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </button>

      {/* Quick-action footer */}
      <div
        className="flex items-center gap-1 border-t px-4 py-2.5"
        style={{ borderColor: "var(--border)" }}
      >
        <span
          className="mr-1 text-[10px] font-medium uppercase tracking-wider"
          style={{ color: "var(--muted-foreground)" }}
        >
          Quick
        </span>

        {[
          { label: "Cities",     icon: MapPin,      href: `/countries/${country.slug}/cities`     },
          { label: "Vendors",    icon: Store,       href: `/countries/${country.slug}/vendors`    },
          { label: "Compliance", icon: ShieldCheck, href: `/countries/${country.slug}/compliance` },
          { label: "Stats",      icon: BarChart2,   href: `/countries/${country.slug}/stats`      },
        ].map(({ label, icon: Icon, href }) => (
          <Link
            key={label}
            href={href}
            title={label}
            className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors duration-150"
            style={{ color: "var(--muted-foreground)" }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLAnchorElement
              el.style.backgroundColor = "var(--muted)"
              el.style.color           = "var(--foreground)"
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLAnchorElement
              el.style.backgroundColor = ""
              el.style.color           = "var(--muted-foreground)"
            }}
            aria-label={`${label} — ${country.name}`}
          >
            <Icon className="h-3.5 w-3.5" />
          </Link>
        ))}
      </div>
    </div>
  )
}