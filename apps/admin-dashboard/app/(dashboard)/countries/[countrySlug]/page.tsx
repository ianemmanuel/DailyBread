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
import Hero from "@/components/countries/detail/Hero"
import Metrics from "@/components/countries/detail/Metrics"
import CitiesTable from "@/components/countries/detail/CitiesTable"
import CompliancePanel from "@/components/countries/detail/CompliancePanel"
import { CountryAdminTable } from "@/components/countries/detail/AdminTable"
import { fetchCountryDetail } from "@/lib/api/server/countries"
import SectionTitle from "@/components/countries/detail/SectionTitle"
import VendorEcosystemSection from "@/components/countries/detail/vendor/VendorEcosystemSection"
import { fetchCountryVendorMetrics, fetchLatestVendorApplications } from "@/lib/api/server/vendors"

export const dynamicParams = true

interface Props { params: Promise<{ countrySlug: string}>}

export async function generateMetadata({ params }: Props): Promise<Metadata>{
  const { getToken, userId } = await auth()

  if (!userId) {
    return { title: "Unauthorized" }
  }

  const token = await getToken()

  if (!token) {
    return { title: "Unauthorized" }
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

  const [
    vendorMetrics,
    latestApplications,
  ] = await Promise.all([
    fetchCountryVendorMetrics(
      token,
      countrySlug,
    ),
    fetchLatestVendorApplications(
      token,
      countrySlug,
    ),
  ])


  const {
    country,
    metrics,
    cities,
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

      <Hero country={country} />

      <Metrics metrics={metrics} />

      <section className="space-y-3 pt-4">
        <SectionTitle
          icon={MapPin}
          label="Cities"
          href={`/countries/${country.slug}/cities`}
        />

        <CitiesTable
          cities={cities}
          countrySlug={country.slug}
        />
      </section>

      <section className="space-y-3 pt-4">
        <SectionTitle
          icon={Store}
          label="Vendor Ecosystem"
          href={`/countries/${country.slug}/vendors`}
        />

        <VendorEcosystemSection
          vendormetrics={vendorMetrics}
          applications={latestApplications}
        />
      
      </section>

      <section className="space-y-3 pt-4">
        <SectionTitle
          icon={ShieldCheck}
          label="Compliance & Legal"
          href={`/countries/${country.slug}/compliance`}
        />

        <CompliancePanel items={compliance} />
      </section>

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