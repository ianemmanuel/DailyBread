"use client"

import { useRouter } from "next/navigation"
import { MapPin, Store, ArrowRight } from "lucide-react"
import { GeoStatusBadge } from "@/components/geography/shared/GeoStatusBadge"
import type { Country } from "@repo/types/admin-app"

interface CountryCardProps {
  country: Country
}

export function CountryCard({ country }: CountryCardProps) {
  const router = useRouter()

  const cityCount   = country._count?.cities  ?? 0
  const vendorCount = country._count?.vendors ?? 0

  return (
    <button
      type="button"
      onClick={() => router.push(`/countries/${country.id}`)}
      className="group w-full text-left"
      aria-label={`View ${country.name} details`}
    >
      <div
        className={[
          // Layout
          "relative flex flex-col gap-4 rounded-xl p-5",
          // Base surface
          "border transition-all duration-200",
          // Hover: lift + border brightens
          "hover:-translate-y-0.5 hover:shadow-md",
        ].join(" ")}
        style={{
          backgroundColor: "var(--card)",
          borderColor: "var(--border)",
        }}
        // Hover border colour via JS — avoids needing extra CSS classes
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
        {/* ── Top row: flag/code + status badge ─────────────── */}
        <div className="flex items-start justify-between gap-3">
          {/* Country code mark */}
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-base font-bold font-display tracking-wide"
            style={{
              backgroundColor: "color-mix(in oklch, var(--primary) 10%, transparent)",
              color: "var(--primary)",
            }}
          >
            {country.code}
          </div>

          <GeoStatusBadge status={country.status} />
        </div>

        {/* ── Country name ───────────────────────────────────── */}
        <div className="flex-1">
          <h3
            className="font-display text-base font-semibold leading-snug tracking-tight"
            style={{ color: "var(--foreground)" }}
          >
            {country.name}
          </h3>

          {country.currency && (
            <p
              className="mt-0.5 text-xs"
              style={{ color: "var(--muted-foreground)" }}
            >
              {country.currency}
              {country.phoneCode  ? ` · ${country.phoneCode }` : ""}
            </p>
          )}
        </div>

        {/* ── Stats row ──────────────────────────────────────── */}
        <div
          className="flex items-center gap-4 border-t pt-3 text-xs"
          style={{
            borderColor: "var(--border)",
            color: "var(--muted-foreground)",
          }}
        >
          <span className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span>
              <strong
                className="font-semibold tabular-nums"
                style={{ color: "var(--foreground)" }}
              >
                {cityCount}
              </strong>{" "}
              {cityCount === 1 ? "city" : "cities"}
            </span>
          </span>

          <span className="flex items-center gap-1.5">
            <Store className="h-3.5 w-3.5 shrink-0" />
            <span>
              <strong
                className="font-semibold tabular-nums"
                style={{ color: "var(--foreground)" }}
              >
                {vendorCount}
              </strong>{" "}
              {vendorCount === 1 ? "vendor" : "vendors"}
            </span>
          </span>

          {/* Arrow — slides in on group hover */}
          <span
            className="ml-auto flex items-center gap-1 font-medium transition-all duration-200 opacity-0 group-hover:opacity-100 group-hover:translate-x-0 -translate-x-1 cursor-pointer"
            style={{ color: "var(--primary)" }}
          >
            View
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
    </button>
  )
}