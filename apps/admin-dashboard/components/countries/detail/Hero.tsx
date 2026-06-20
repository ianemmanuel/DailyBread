"use client"

import Link from "next/link"
import {
  CheckCircle2,
  XCircle,
  BarChart2,
  ShieldCheck,
  MapPin,
  Store,
  FileText,
} from "lucide-react"
import { Button } from "@repo/ui/components/button"
import type { Country } from "@repo/types/admin-app"

interface CountryHeroProps {
  country: Country
}

export default function Hero({ country }: CountryHeroProps) {
  const isActive = country.status === "ACTIVE"

  const quickActions = [
    { label: "Analytics",  icon: BarChart2,   href: `/countries/${country.slug}/analytics`      },
    { label: "Vendors",    icon: Store,       href: `/countries/${country.slug}/vendors`     },
    { label: "Cities",     icon: MapPin,      href: `/countries/${country.slug}/cities`      },
    { label: "Compliance", icon: ShieldCheck, href: `/countries/${country.slug}/compliance`  },
    { label: "Documents",  icon: FileText,    href: `/countries/${country.slug}/documents`   },
  ]

  return (
    <div
      className="rounded-xl border p-5 sm:p-6 pb-6"
      style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-lg font-bold font-display tracking-wide"
            style={{
              backgroundColor: "color-mix(in oklch, var(--primary) 10%, transparent)",
              color: "var(--primary)",
            }}
          >
            {country.code}
          </div>

          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1
                className="text-xl font-semibold leading-tight tracking-tight"
                style={{ color: "var(--foreground)", fontFamily: "var(--font-display)" }}
              >
                {country.name}
              </h1>
              <span
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                style={{
                  backgroundColor: isActive ? "var(--success-bg)" : "var(--destructive-bg)",
                  color: isActive ? "var(--success)" : "var(--destructive)",
                }}
              >
                {isActive
                  ? <CheckCircle2 className="h-3 w-3" />
                  : <XCircle      className="h-3 w-3" />
                }
                {isActive ? "Active" : "Inactive"}
              </span>
            </div>

            {/* Meta row */}
            <div
              className="flex flex-wrap items-center gap-3 text-xs"
              style={{ color: "var(--muted-foreground)" }}
            >
              {country.currency && (
                <span className="flex items-center gap-1">
                  <span
                    className="rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold"
                    style={{ backgroundColor: "var(--muted)", color: "var(--foreground)" }}
                  >
                    {country.currency}
                  </span>
                </span>
              )}
              {country.phoneCode && (
                <span>{country.phoneCode}</span>
              )}
              <span className="h-3 w-px" style={{ backgroundColor: "var(--border)" }} />
              <span>{country._count?.cities ?? 0} cities</span>
              <span>{country._count?.vendors ?? 0} vendors</span>
            </div>
          </div>
        </div>
      </div>

      <div
        className="mt-5 flex flex-wrap items-center gap-2 border-t pt-4"
        style={{ borderColor: "var(--border)" }}
      >
        <span className="text-xs font-medium mr-1" style={{ color: "var(--muted-foreground)" }}>
          Quick access:
        </span>
        {quickActions.map(({ label, icon: Icon, href }) => (
          <Link key={label} href={href}>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 rounded-lg px-3 text-xs font-medium cursor-pointer"
            >
              <Icon className="h-3 w-3" />
              {label}
            </Button>
          </Link>
        ))}
      </div>
    </div>
  )
}