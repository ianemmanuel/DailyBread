import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { Globe } from "lucide-react"
import { PageHeader } from "@/components/dashboard/layout/PageHeader"
import { CountryGrid } from "@/components/countries/CountryGrid"
import type { Country, ApiSuccess } from "@repo/types/admin-app"

export const metadata = { title: "Countries" }

/* Data fetching */
async function getCountries(token: string): Promise<Country[]> {
  const res = await fetch(
    `${process.env.BACKEND_API_URL}/admin/v1/geography/countries`,
    {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 60 },
    }
  )
  if (!res.ok) return []
  const { data }: ApiSuccess<Country[]> = await res.json()
  return data
}


export default async function CountriesPage() {
  const { getToken, userId } = await auth()
  if (!userId) redirect("/sign-in")

  const token     = await getToken()
  const countries = await getCountries(token!)

  const activeCount   = countries.filter((c) => c.status === "ACTIVE").length
  const inactiveCount = countries.length - activeCount

  return (
    <>

      <PageHeader
        title="Countries"
        description="Manage operational countries and their delivery cities."
        icon={Globe}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <SummaryTile label="Total" value={countries.length} />
        <SummaryTile label="Active" value={activeCount}   accent />
        <SummaryTile
          label="Inactive"
          value={inactiveCount}
          className="col-span-2 sm:col-span-1"
        />
      </div>

      <CountryGrid countries={countries} pageSize={9} />
    </>
  )
}

/* ── Summary tile — small stat strip above the grid ──────────── */
interface SummaryTileProps {
  label: string
  value: number
  accent?: boolean
  className?: string
}

function SummaryTile({ label, value, accent = false, className }: SummaryTileProps) {
  return (
    <div
      className={[
        "flex flex-col gap-1 rounded-xl border px-5 py-4",
        className ?? "",
      ].join(" ")}
      style={{
        backgroundColor: accent
          ? "color-mix(in oklch, var(--primary) 7%, var(--card))"
          : "var(--card)",
        borderColor: accent
          ? "color-mix(in oklch, var(--primary) 25%, var(--border))"
          : "var(--border)",
      }}
    >
      <span
        className="text-xs font-medium uppercase tracking-wider"
        style={{ color: accent ? "var(--primary)" : "var(--muted-foreground)" }}
      >
        {label}
      </span>
      <span
        className="font-display text-2xl font-semibold tabular-nums leading-none tracking-tight"
        style={{ color: "var(--foreground)" }}
      >
        {value}
      </span>
    </div>
  )
}