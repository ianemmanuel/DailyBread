import type { Metadata } from "next"
import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { Globe } from "lucide-react"
import { PageHeader } from "@/components/dashboard/layout/PageHeader"
import { CountryKPIStrip } from "@/components/countries/CountryKPIStrip"
import { CountryGrid } from "@/components/countries/sections/CountryGrid"
import { SectionLabel } from "@/components/shared/SectionLabel"
import { EmptyState } from "@/components/shared/EmptyState"
import { FetchError } from "@/components/shared/FetchError"
import { fetchActiveCountries } from "@/lib/api/server/countries"
import { fetchPlatformKPIs } from "@/lib/api/server/platform"

export const metadata: Metadata = { title: "Countries" }


export default async function CountriesPage() {
  const { getToken, userId } = await auth()
  if (!userId) redirect("/sign-in")

  const token = await getToken()

  //? Parallel fetch — neither blocks the other
  const [kpisResult, countriesResult] = await Promise.all([
    fetchPlatformKPIs(token!),
    fetchActiveCountries(token!),
  ])

  return (
    <>
      <PageHeader
        title="Countries"
        description="Platform expansion overview, operational footprint, and country health."
        icon={Globe}
      />

      {/* KPI strip */}
      {kpisResult.ok ? (
        <CountryKPIStrip kpis={kpisResult.data} />
      ) : (
        <FetchError message={kpisResult.error} context="platform metrics" />
      )}

      {/* Active countries */}
      <section className="space-y-4">
        <SectionLabel>Active Countries</SectionLabel>

        {!countriesResult.ok ? (
          <FetchError message={countriesResult.error} context="countries" />
        ) : countriesResult.data.length === 0 ? (
          <EmptyState
            icon={Globe}
            title="No active countries"
            description="No countries are currently active. A super admin can activate countries from the inactive list."
            actionLabel="View inactive countries"
            actionHref="/countries/inactive"
          />
        ) : (
          <CountryGrid countries={countriesResult.data} pageSize={9} />
        )}
      </section>
    </>
  )
}