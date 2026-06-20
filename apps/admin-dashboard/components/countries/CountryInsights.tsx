"use client"

import Link from "next/link"
import {
  AlertTriangle,
  MapPin,
  TrendingUp,
  FileWarning,
  UserX,
  ArrowRight,
  Info,
} from "lucide-react"
import type { CountrySummaryResult } from "@/types/geography.types"


interface InsightItem {
  countryName: string
  countryCode: string
  countrySlug: string
  detail:      string
}

interface InsightGroup {
  id:       string
  label:    string
  icon:     React.ElementType
  severity: "warning" | "info" | "danger" | "neutral"
  items:    InsightItem[]
  emptyMsg: string
  ctaLabel: string
  ctaHref:  (slug: string) => string
}

interface CountryInsightsPanelProps {
  /**
   * Pass live countries from SSR when available.
   * Falls back to static placeholder data when undefined
   * (until the backend endpoints for compliance / admin scoping are wired).
   */
  countries?: CountrySummaryResult[]
}

// ─── Static placeholder helpers ───────────────────────────────
// Replace these with real API data once the relevant controllers exist.

const STATIC_NO_CITIES: InsightItem[] = [
  { countryName: "Ethiopia",     countryCode: "ET", countrySlug: "et", detail: "No active cities configured" },
  { countryName: "Tanzania",     countryCode: "TZ", countrySlug: "tz", detail: "No active cities configured" },
]

const STATIC_HIGH_VENDOR_GROWTH: InsightItem[] = [
  { countryName: "Kenya",         countryCode: "KE", countrySlug: "ke", detail: "+34 vendors in the last 30 days" },
  { countryName: "South Africa",  countryCode: "ZA", countrySlug: "za", detail: "+21 vendors in the last 30 days" },
  { countryName: "Nigeria",       countryCode: "NG", countrySlug: "ng", detail: "+18 vendors in the last 30 days" },
]

const STATIC_COMPLIANCE_EXPIRY: InsightItem[] = [
  { countryName: "UAE",           countryCode: "AE", countrySlug: "ae", detail: "3 vendor licenses expire within 14 days" },
  { countryName: "Kenya",         countryCode: "KE", countrySlug: "ke", detail: "1 vendor license expires within 7 days"  },
]

const STATIC_INACTIVE_ADMINS: InsightItem[] = [
  { countryName: "Ghana",         countryCode: "GH", countrySlug: "gh", detail: "No admin activity in 30+ days" },
]

// ─── Severity styles (mirrors VARIANT_STYLES pattern in KPIStrip) ──

const SEVERITY_STYLES = {
  warning: {
    headerBg:    "color-mix(in oklch, var(--warning)  8%, var(--card))",
    headerBorder:"color-mix(in oklch, var(--warning) 30%, var(--border))",
    iconBg:      "color-mix(in oklch, var(--warning) 14%, transparent)",
    iconColor:   "var(--warning)",
    badgeColor:  "var(--warning)",
    badgeBg:     "var(--warning-bg)",
    dot:         "var(--warning)",
  },
  danger: {
    headerBg:    "color-mix(in oklch, var(--destructive)  8%, var(--card))",
    headerBorder:"color-mix(in oklch, var(--destructive) 30%, var(--border))",
    iconBg:      "color-mix(in oklch, var(--destructive) 14%, transparent)",
    iconColor:   "var(--destructive)",
    badgeColor:  "var(--destructive)",
    badgeBg:     "var(--destructive-bg)",
    dot:         "var(--destructive)",
  },
  info: {
    headerBg:    "color-mix(in oklch, var(--info)  8%, var(--card))",
    headerBorder:"color-mix(in oklch, var(--info) 30%, var(--border))",
    iconBg:      "color-mix(in oklch, var(--info) 14%, transparent)",
    iconColor:   "var(--info)",
    badgeColor:  "var(--info)",
    badgeBg:     "var(--info-bg)",
    dot:         "var(--info)",
  },
  neutral: {
    headerBg:    "var(--card)",
    headerBorder:"var(--border)",
    iconBg:      "var(--icon-bg)",
    iconColor:   "var(--icon-fg)",
    badgeColor:  "var(--muted-foreground)",
    badgeBg:     "var(--muted)",
    dot:         "var(--muted-foreground)",
  },
} as const

// ─── Sub-components ────────────────────────────────────────────

function InsightCard({ group }: { group: InsightGroup }) {
  const s    = SEVERITY_STYLES[group.severity]
  const Icon = group.icon
  const count = group.items.length

  return (
    <div
      className="flex flex-col rounded-xl border overflow-hidden transition-shadow duration-200 hover:shadow-md"
      style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
    >
      {/* Card header */}
      <div
        className="flex items-center justify-between gap-3 px-4 py-3 border-b"
        style={{
          backgroundColor: s.headerBg,
          borderColor:     s.headerBorder,
        }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: s.iconBg }}
          >
            <Icon className="h-3.5 w-3.5" style={{ color: s.iconColor }} />
          </div>
          <span
            className="text-xs font-semibold leading-tight tracking-wide uppercase truncate"
            style={{ color: "var(--foreground)" }}
          >
            {group.label}
          </span>
        </div>

        {/* Count badge */}
        {count > 0 && (
          <span
            className="shrink-0 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular-nums"
            style={{
              backgroundColor: s.badgeBg,
              color:           s.badgeColor,
            }}
          >
            {count}
          </span>
        )}
      </div>

      {/* Items list */}
      <div className="flex flex-col divide-y" style={{ borderColor: "var(--border)" }}>
        {group.items.length === 0 ? (
          <div className="flex items-center gap-2 px-4 py-3">
            <Info className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--muted-foreground)" }} />
            <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
              {group.emptyMsg}
            </p>
          </div>
        ) : (
          group.items.map((item) => (
            <Link
              key={item.countrySlug}
              href={group.ctaHref(item.countrySlug)}
              className="group/row flex items-center gap-3 px-4 py-2.5 transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-inset"
              style={{ ["--tw-ring-color" as string]: "var(--ring)" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.backgroundColor = "var(--accent)"
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.backgroundColor = ""
              }}
            >
              {/* Severity dot */}
              <span
                className="shrink-0 h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: s.dot }}
              />

              {/* Country code pill */}
              <span
                className="shrink-0 inline-flex h-5 w-7 items-center justify-center rounded text-[10px] font-bold tracking-wide uppercase"
                style={{
                  backgroundColor: "color-mix(in oklch, var(--primary) 10%, transparent)",
                  color:           "var(--primary)",
                  fontFamily:      "var(--font-display)",
                }}
              >
                {item.countryCode}
              </span>

              {/* Country name + detail */}
              <div className="flex flex-1 min-w-0 items-baseline gap-2">
                <span
                  className="shrink-0 text-xs font-semibold leading-snug"
                  style={{ color: "var(--foreground)" }}
                >
                  {item.countryName}
                </span>
                <span
                  className="truncate text-[11px] leading-snug"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {item.detail}
                </span>
              </div>

              {/* Arrow — slides in on row hover */}
              <ArrowRight
                className="h-3 w-3 shrink-0 -translate-x-1 opacity-0 transition-all duration-150 group-hover/row:translate-x-0 group-hover/row:opacity-100"
                style={{ color: "var(--primary)" }}
              />
            </Link>
          ))
        )}
      </div>

      {/* Footer CTA — only when there are items */}
      {group.items.length > 0 && (
        <div
          className="mt-auto border-t px-4 py-2.5"
          style={{ borderColor: "var(--border)" }}
        >
          <Link
            href={group.ctaHref(group.items[0]?.countrySlug ?? "")}
            className="flex items-center gap-1 text-[11px] font-medium transition-colors duration-150"
            style={{ color: "var(--primary)" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.color = "var(--primary-hover)"
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.color = "var(--primary)"
            }}
          >
            {group.ctaLabel}
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      )}
    </div>
  )
}


export function CountryInsightsPanel({ countries }: CountryInsightsPanelProps) {
  // Derive "no active cities" from live data if available, else use static
  const noCitiesItems: InsightItem[] = countries
    ? countries
        .filter((c) => (c._count?.cities ?? 0) === 0)
        .map((c) => ({
          countryName: c.name,
          countryCode: c.code,
          countrySlug: c.slug,
          detail:      "No cities configured",
        }))
    : STATIC_NO_CITIES

  const insightGroups: InsightGroup[] = [
    {
      id:       "no-cities",
      label:    "No Active Cities",
      icon:     MapPin,
      severity: "danger",
      items:    noCitiesItems,
      emptyMsg: "All active countries have at least one city.",
      ctaLabel: "Add cities",
      ctaHref:  (slug) => `/countries/${slug}/cities`,
    },
    {
      id:       "vendor-growth",
      label:    "High Vendor Growth",
      icon:     TrendingUp,
      severity: "info",
      // TODO: replace with real data from /admin/v1/platform/insights/vendor-growth
      items:    STATIC_HIGH_VENDOR_GROWTH,
      emptyMsg: "No significant vendor growth spikes detected.",
      ctaLabel: "Review all vendors",
      ctaHref:  (slug) => `/countries/${slug}/vendors`,
    },
    {
      id:       "compliance",
      label:    "Compliance Expiring",
      icon:     FileWarning,
      severity: "warning",
      // TODO: replace with real data from /admin/v1/platform/insights/compliance
      items:    STATIC_COMPLIANCE_EXPIRY,
      emptyMsg: "No compliance documents expiring soon.",
      ctaLabel: "Review compliance",
      ctaHref:  (slug) => `/countries/${slug}/compliance`,
    },
    {
      id:       "inactive-admins",
      label:    "Inactive Admins",
      icon:     UserX,
      severity: "warning",
      // TODO: replace with real data from /admin/v1/platform/insights/inactive-admins
      items:    STATIC_INACTIVE_ADMINS,
      emptyMsg: "All countries have recently active admins.",
      ctaLabel: "View admins",
      ctaHref:  (slug) => `/countries/${slug}/admins`,
    },
  ]

  const totalAlerts = insightGroups
    .filter((g) => g.severity === "danger" || g.severity === "warning")
    .reduce((sum, g) => sum + g.items.length, 0)

  return (
    <section className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <AlertTriangle
            className="h-3.5 w-3.5 shrink-0"
            style={{ color: totalAlerts > 0 ? "var(--warning)" : "var(--muted-foreground)" }}
          />
          <span
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: "var(--muted-foreground)" }}
          >
            Expansion &amp; Risk Insights
          </span>
        </div>

        {totalAlerts > 0 && (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
            style={{
              backgroundColor: "var(--warning-bg)",
              color:           "var(--warning)",
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full animate-pulse"
              style={{ backgroundColor: "var(--warning)" }}
            />
            {totalAlerts} {totalAlerts === 1 ? "alert" : "alerts"}
          </span>
        )}
      </div>

      {/* Disclaimer for static data */}
      <div
        className="flex items-start gap-2 rounded-lg border px-3 py-2.5"
        style={{
          backgroundColor: "color-mix(in oklch, var(--info) 6%, var(--card))",
          borderColor:     "color-mix(in oklch, var(--info) 22%, var(--border))",
        }}
      >
        <Info
          className="mt-0.5 h-3.5 w-3.5 shrink-0"
          style={{ color: "var(--info)" }}
        />
        <p className="text-[11px] leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
          <span className="font-semibold" style={{ color: "var(--foreground)" }}>
            Vendor growth, compliance, and admin activity
          </span>{" "}
          data shown is illustrative — live endpoints will replace this once
          the insights controllers are wired.{" "}
          <span className="font-medium" style={{ color: "var(--foreground)" }}>
            Cities
          </span>{" "}
          data is live from your active countries.
        </p>
      </div>

      {/* 2×2 insight cards grid */}
      <div className="grid gap-4 sm:grid-cols-2">
        {insightGroups.map((group) => (
          <InsightCard key={group.id} group={group} />
        ))}
      </div>
    </section>
  )
}