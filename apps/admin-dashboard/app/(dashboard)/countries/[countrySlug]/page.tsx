import type { Metadata } from "next"
import { auth } from "@clerk/nextjs/server"
import { notFound, redirect } from "next/navigation"
import {
  Globe,
  MapPin,
  Store,
  Users,
  ShieldCheck,
} from "lucide-react"
import { PageHeader } from "@/components/dashboard/layout/PageHeader"
import { CountryHero } from "@/components/countries/detail/Hero"
import { CountryMetrics } from "@/components/countries/detail/Metrics"
import { CountryCitiesTable } from "@/components/countries/detail/CitiesTable"
import { CountryVendorSnapshot } from "@/components/countries/detail/VendorSnapshot"
import { CountryCompliancePanel } from "@/components/countries/detail/CompliancePanel"
import { CountryAdminTable } from "@/components/countries/detail/AdminTable"
import { fetchCountryDetail } from "@/lib/api/server/countries"
import SectionTitle from "@/components/countries/detail/SectionTitle"

export const dynamicParams = true

interface Props {
  params: Promise<{ countrySlug: string }>
}



export async function generateMetadata({
  params,
}: Props): Promise<Metadata> {
  const { getToken, userId } = await auth()

  if (!userId) {
    return { title: "Country Details" }
  }

  const token = await getToken()

  if (!token) {
    return { title: "Country Details" }
  }

  const { countrySlug } = await params

  const detail = await fetchCountryDetail(token, countrySlug)

  if (!detail) {
    return { title: "Country Not Found" }
  }

  return {
    title: detail.country.name,
  }
}


export default async function CountryDetailPage({ params }: Props) {
  const { getToken, userId } = await auth()
  if (!userId) redirect("/sign-in")

  const token = await getToken()
  if (!token) redirect("/sign-in")

  const { countrySlug } = await params

  const detail = await fetchCountryDetail(token, countrySlug)

  if (!detail) notFound()

  const {
    country,
    metrics,
    cities,
    vendorStats,
    compliance,
    admins,
  } = detail

  return (
    <>
      <PageHeader
        title={country.name}
        description={`Operational overview · ${country.code} · ${country.currency ?? ""}`}
        icon={Globe}
      />

      <CountryHero country={country} />

      <CountryMetrics metrics={metrics} />

      <section className="space-y-3">
        <SectionTitle
          icon={MapPin}
          label="Cities"
          href={`/countries/${country.slug}/cities`}
        />

        <CountryCitiesTable
          cities={cities}
          countrySlug={country.slug}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-3">
          <SectionTitle
            icon={Store}
            label="Vendor Ecosystem"
            href={`/countries/${country.slug}/vendors`}
          />

          <CountryVendorSnapshot stats={vendorStats} />
        </section>

        <section className="space-y-3">
          <SectionTitle
            icon={ShieldCheck}
            label="Compliance & Legal"
            href={`/countries/${country.slug}/compliance`}
          />

          <CountryCompliancePanel items={compliance} />
        </section>
      </div>

      <section className="space-y-3">
        <SectionTitle
          icon={Users}
          label="Admins & Staff"
          href={`/countries/${country.slug}/admins`}
        />

        <CountryAdminTable admins={admins} />
      </section>
    </>
  )
}