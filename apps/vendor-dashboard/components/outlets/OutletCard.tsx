"use client"

import Link from "next/link"
import { MapPin, Star, Crown } from "lucide-react"
import type { Outlet } from "@/types/outlet"
import { OutletStatusBadges } from "./OutletStatusBadges"

interface OutletCardProps {
  outlet: Outlet
}

export function OutletCard({ outlet }: OutletCardProps) {
  const isOperational =
    !outlet.vendorDisabledAt &&
    outlet.adminStatus === "ACTIVE" &&
    !outlet.isTemporarilyClosed

  return (
    <Link
      href={`/dashboard/outlets/${outlet.id}`}
      className="dash-card group block p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
      style={{ boxShadow: "0 2px 12px var(--shadow-card)" }}
    >
      {/* Header */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="flex size-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold"
            style={{
              background: "color-mix(in oklch, var(--primary) 15%, transparent)",
              color: "var(--primary)",
            }}
          >
            {outlet.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="truncate font-semibold transition-colors text-[var(--foreground)] group-hover:text-[var(--primary)]">
                {outlet.name}
              </h3>
              {outlet.isMainOutlet && (
                <Crown className="size-3.5 shrink-0 text-[var(--primary)]" />
              )}
            </div>
            {outlet.city && (
              <p className="mt-0.5 flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
                <MapPin className="size-3" />
                {outlet.city.name}
              </p>
            )}
          </div>
        </div>

        {/* Live indicator */}
        <div className="flex shrink-0 items-center gap-1.5 text-xs">
          <span
            className="size-2 rounded-full"
            style={{
              background: isOperational ? "var(--success)" : "var(--muted-foreground)",
              boxShadow: isOperational
                ? "0 0 0 3px color-mix(in oklch, var(--success) 20%, transparent)"
                : "none",
            }}
          />
          <span className="text-[var(--muted-foreground)]">
            {isOperational ? "Open" : "Closed"}
          </span>
        </div>
      </div>

      {/* Address */}
      <p className="mb-4 line-clamp-1 text-sm text-[var(--muted-foreground)]">
        {outlet.addressLine1}
      </p>

      {/* Stats row — border-r on children replaces divideColor (not a valid CSS prop) */}
      <div
        className="mb-4 grid grid-cols-3 overflow-hidden rounded-xl py-3 text-center text-xs"
        style={{ background: "color-mix(in oklch, var(--muted) 40%, transparent)" }}
      >
        <div className="px-3" style={{ borderRight: "1px solid var(--border)" }}>
          <p className="font-semibold text-[var(--foreground)]">{outlet._count?.meals ?? 0}</p>
          <p className="text-[var(--muted-foreground)]">Meals</p>
        </div>
        <div className="px-3" style={{ borderRight: "1px solid var(--border)" }}>
          <p className="font-semibold text-[var(--foreground)]">
            {outlet.deliveryFee != null ? `KSh ${outlet.deliveryFee}` : "—"}
          </p>
          <p className="text-[var(--muted-foreground)]">Del. Fee</p>
        </div>
        <div className="flex flex-col items-center px-3">
          <p className="flex items-center gap-0.5 font-semibold text-[var(--foreground)]">
            <Star className="size-3" style={{ fill: "var(--primary)", color: "var(--primary)" }} />
            {outlet.ratings > 0 ? outlet.ratings.toFixed(1) : "—"}
          </p>
          <p className="text-[var(--muted-foreground)]">Rating</p>
        </div>
      </div>

      {/* Status badges */}
      <OutletStatusBadges outlet={outlet} />

      {/* Flagged warning */}
      {outlet.reviewStatus === "FLAGGED" && outlet.flagReasons.length > 0 && (
        <p className="mt-3 text-xs" style={{ color: "var(--warning)" }}>
          ⚠ Pending review: {outlet.flagReasons.join(", ").replace(/_/g, " ").toLowerCase()}
        </p>
      )}
    </Link>
  )
}