// app/(dashboard)/geography/countries/[countryId]/cities/new/page.tsx
import Link from "next/link"
import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { notFound } from "next/navigation"
import { ChevronRight, Globe, MapPin } from "lucide-react"
import { CityForm } from "@/components/geography/CityForm"
import type { Country, ApiSuccess } from "@repo/types/admin-app"

interface Props { params: Promise<{ countryId: string }> }

export const metadata = { title: "Add City" }

async function getCountry(token: string, countryId: string): Promise<Country | null> {
  const res = await fetch(
    `${process.env.BACKEND_API_URL}/admin/v1/geography/countries/${countryId}`,
    { headers: { Authorization: `Bearer ${token}` }, next: { revalidate: 60 } },
  )
  if (!res.ok) return null
  const { data }: ApiSuccess<Country> = await res.json()
  return data
}

export default async function NewCityPage({ params }: Props) {
  const { countryId } = await params
  const { getToken, userId } = await auth()
  if (!userId) redirect("/sign-in")

  const token   = await getToken()
  const country = await getCountry(token!, countryId)
  if (!country) notFound()

  return (
    <div className="page-content animate-slide-up max-w-lg">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Globe className="size-3.5" />
        <Link href="/geography/countries" className="hover:text-foreground transition-colors">
          Geography
        </Link>
        <ChevronRight className="size-3" />
        <Link
          href={`/geography/countries/${countryId}/cities`}
          className="hover:text-foreground transition-colors"
        >
          {country.name}
        </Link>
        <ChevronRight className="size-3" />
        <span className="text-foreground font-medium">Add city</span>
      </nav>

      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight flex items-center gap-2">
          <MapPin className="size-6 text-primary" />
          Add a city
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Adding a new city to <strong className="text-foreground">{country.name}</strong>.
          You'll set the city boundary and service areas in the next steps.
        </p>
      </div>

      <div className="admin-card">
        <CityForm countryId={countryId} countryName={country.name} />
      </div>
    </div>
  )
}