import type { Metadata } from "next"
import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { Globe, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/dashboard/layout/PageHeader"
import { CountryKPIStrip } from "@/components/countries/sections/CountryKPIStrip"
import { CountriesTable } from "@/components/countries/tables/CountriesTable"
import { CountryInsights } from "@/components/countries/insights/CountryInsigits"
import { CountryActivityFeed } from "@/components/countries/feed/CountryActivityFeed"
import { FetchError } from "@/components/shared/FetchError"
import { EmptyState } from "@/components/shared/EmptyState"
import { fetchActiveCountries } from "@/lib/api/server/countries"
import { fetchPlatformKPIs } from "@/lib/api/server/platform"
import Link from "next/link"

export const metadata: Metadata = { title: "Countries" }

export default async function CountriesPage() {
  const { getToken, userId } = await auth()
  if (!userId) redirect("/sign-in")

  const token = await getToken()

  const [kpisResult, countriesResult] = await Promise.all([
    fetchPlatformKPIs(token!),
    fetchActiveCountries(token!),
  ])

  return (
    <>
      <PageHeader
        title="Countries"
        description="Platform expansion overview, operational footprint and country health."
        icon={Globe}
        actions={
          <Button
            asChild
            size="sm"
            className="gap-1.5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0"
          >
            <Link href="/countries/add-country">
              <Plus className="h-4 w-4 transition-transform duration-200 group-hover:rotate-90" />
              Add Country
            </Link>
          </Button>
        }
      />

      {kpisResult.ok ? (
        <CountryKPIStrip kpis={kpisResult.data} />
      ) : (
        <FetchError message={kpisResult.error} context="platform metrics" className="mb-6" />
      )}

      {/* Two-column body
          Left col: table + activity feed (both grow with the content area)
          Right col: insights sidebar (fixed width on lg+, full width on mobile)
          The layout.tsx wrapper's max-w-[1600px] + paddingLeft CSS var handle
          the sidebar expand/collapse — nothing extra needed here.
      */}
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        {/* Left — table then activity feed */}
        <div className="min-w-0 flex-1 space-y-5">
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
            <CountriesTable countries={countriesResult.data} pageSize={8} />
          )}

          <CountryActivityFeed />
        </div>

        {/* Right — region chart, health, GMV ranking */}
        <aside className="w-full shrink-0 lg:w-[320px] xl:w-[340px]">
          <CountryInsights />
        </aside>
      </div>
    </>
  )
}