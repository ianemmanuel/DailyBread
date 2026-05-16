
import Link from "next/link"
import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { notFound } from "next/navigation"
import { ChevronRight, Globe, MapPin } from "lucide-react"
import { BoundaryPageClient } from "@/components/geography/boundary/BoundaryPageClient"
import type { CityBoundaryData, City, Country, ApiSuccess } from "@repo/types/admin-app"

interface Props { params: Promise<{ cityId: string }> }

export const metadata = { title: "City Boundary" }

async function getData(token: string, cityId: string) {
  const [cityRes, boundaryRes] = await Promise.all([
    fetch(`${process.env.BACKEND_API_URL}/admin/v1/geography/cities/${cityId}`, {
      headers: { Authorization: `Bearer ${token}` },
      next   : { revalidate: 60 },
    }),
    fetch(`${process.env.BACKEND_API_URL}/admin/v1/geography/cities/${cityId}/boundary`, {
      headers: { Authorization: `Bearer ${token}` },
      cache  : "no-store", // always fresh — admin needs latest polygon
    }),
  ])

  if (!cityRes.ok) return null

  const { data: city }    : ApiSuccess<City>             = await cityRes.json()
  const { data: boundary }: ApiSuccess<CityBoundaryData> = await boundaryRes.json()
  return { city, boundary }
}

async function getCountryCode(token: string, countryId: string): Promise<string> {
  const res = await fetch(
    `${process.env.BACKEND_API_URL}/admin/v1/geography/countries/${countryId}`,
    { headers: { Authorization: `Bearer ${token}` }, next: { revalidate: 300 } },
  )
  if (!res.ok) return "AE"
  const { data }: ApiSuccess<Country> = await res.json()
  return data.code
}

export default async function BoundaryPage({ params }: Props) {
  const { cityId }           = await params
  const { getToken, userId } = await auth()
  if (!userId) redirect("/sign-in")

  const token = await getToken()
  const data  = await getData(token!, cityId)
  if (!data) notFound()

  const { city, boundary } = data
  const countryCode        = await getCountryCode(token!, city.countryId)

  return (
    <div className="flex flex-col h-full gap-4 animate-slide-up">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
        <Globe className="size-3.5" />
        <Link href="/geography/countries" className="hover:text-foreground transition-colors">
          Geography
        </Link>
        <ChevronRight className="size-3" />
        <Link
          href={`/geography/countries/${city.countryId}/cities`}
          className="hover:text-foreground transition-colors"
        >
          {city.countryId}
        </Link>
        <ChevronRight className="size-3" />
        <Link
          href={`/geography/countries/${city.countryId}/cities`}
          className="hover:text-foreground transition-colors"
        >
          {city.name}
        </Link>
        <ChevronRight className="size-3" />
        <span className="text-foreground font-medium">Boundary</span>
      </nav>

      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight flex items-center gap-2">
          <MapPin className="size-6 text-primary" />
          City Boundary — {city.name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Set the operational boundary for {city.name}. Vendors outside this boundary
          cannot onboard.
        </p>
      </div>

      {/* Desktop-only guard */}
      <div className="hidden lg:block flex-1">
        <BoundaryPageClient
          cityId      ={cityId}
          countryCode ={countryCode}
          initial     ={boundary}
        />
      </div>

      <div className="lg:hidden admin-card flex flex-col items-center justify-center py-12 text-center">
        <MapPin className="size-8 text-muted-foreground mb-3" />
        <p className="font-medium">Desktop required</p>
        <p className="text-sm text-muted-foreground mt-1 max-w-xs">
          Drawing city boundaries requires a desktop browser with a larger screen.
        </p>
      </div>
    </div>
  )
}