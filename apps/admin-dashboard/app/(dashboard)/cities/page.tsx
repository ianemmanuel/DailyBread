// app/(dashboard)/cities/page.tsx
import { MapPin } from "lucide-react"
import { PageHeader } from "@/components/dashboard/layout/PageHeader"
import { CreateCityButton } from "@/components/cities/CreateCityButton"
import { CityTable } from "@/components/cities/CityTable"
import { CountryTable } from "@/components/countries/countryTable"

// Mock data based on the Country + City models
const MOCK_CITIES = [
  { id: "1", name: "Lagos", code: "LOS", timezone: "Africa/Lagos", status: "ACTIVE", country: { id: "ng", name: "Nigeria", code: "NG", phoneCode: "+234" } },
  { id: "2", name: "Abuja", code: "ABV", timezone: "Africa/Lagos", status: "ACTIVE", country: { id: "ng", name: "Nigeria", code: "NG", phoneCode: "+234" } },
  { id: "3", name: "Port Harcourt", code: "PHC", timezone: "Africa/Lagos", status: "ACTIVE", country: { id: "ng", name: "Nigeria", code: "NG", phoneCode: "+234" } },
  { id: "4", name: "Kano", code: "KAN", timezone: "Africa/Lagos", status: "ACTIVE", country: { id: "ng", name: "Nigeria", code: "NG", phoneCode: "+234" } },
  { id: "5", name: "Ibadan", code: "IBA", timezone: "Africa/Lagos", status: "ACTIVE", country: { id: "ng", name: "Nigeria", code: "NG", phoneCode: "+234" } },
  { id: "6", name: "Benin City", code: "BNI", timezone: "Africa/Lagos", status: "ACTIVE", country: { id: "ng", name: "Nigeria", code: "NG", phoneCode: "+234" } },
  { id: "7", name: "Nairobi", code: "NBO", timezone: "Africa/Nairobi", status: "ACTIVE", country: { id: "ke", name: "Kenya", code: "KE", phoneCode: "+254" } },
  { id: "8", name: "Mombasa", code: "MBA", timezone: "Africa/Nairobi", status: "ACTIVE", country: { id: "ke", name: "Kenya", code: "KE", phoneCode: "+254" } },
  { id: "9", name: "Kisumu", code: "KIS", timezone: "Africa/Nairobi", status: "ACTIVE", country: { id: "ke", name: "Kenya", code: "KE", phoneCode: "+254" } },
  { id: "10", name: "Nakuru", code: "NKR", timezone: "Africa/Nairobi", status: "ACTIVE", country: { id: "ke", name: "Kenya", code: "KE", phoneCode: "+254" } },
  { id: "11", name: "Eldoret", code: "EDT", timezone: "Africa/Nairobi", status: "ACTIVE", country: { id: "ke", name: "Kenya", code: "KE", phoneCode: "+254" } },
  { id: "12", name: "Accra", code: "ACC", timezone: "Africa/Accra", status: "ACTIVE", country: { id: "gh", name: "Ghana", code: "GH", phoneCode: "+233" } },
  { id: "13", name: "Kumasi", code: "KMS", timezone: "Africa/Accra", status: "ACTIVE", country: { id: "gh", name: "Ghana", code: "GH", phoneCode: "+233" } },
  { id: "14", name: "Cape Town", code: "CPT", timezone: "Africa/Johannesburg", status: "ACTIVE", country: { id: "za", name: "South Africa", code: "ZA", phoneCode: "+27" } },
  { id: "15", name: "Johannesburg", code: "JNB", timezone: "Africa/Johannesburg", status: "ACTIVE", country: { id: "za", name: "South Africa", code: "ZA", phoneCode: "+27" } },
  { id: "16", name: "Durban", code: "DUR", timezone: "Africa/Johannesburg", status: "ACTIVE", country: { id: "za", name: "South Africa", code: "ZA", phoneCode: "+27" } },
  { id: "17", name: "Pretoria", code: "PTA", timezone: "Africa/Johannesburg", status: "ACTIVE", country: { id: "za", name: "South Africa", code: "ZA", phoneCode: "+27" } },
  { id: "18", name: "Casablanca", code: "CAS", timezone: "Africa/Casablanca", status: "ACTIVE", country: { id: "ma", name: "Morocco", code: "MA", phoneCode: "+212" } },
  { id: "19", name: "Marrakech", code: "MRK", timezone: "Africa/Casablanca", status: "ACTIVE", country: { id: "ma", name: "Morocco", code: "MA", phoneCode: "+212" } },
  { id: "20", name: "Cairo", code: "CAI", timezone: "Africa/Cairo", status: "ACTIVE", country: { id: "eg", name: "Egypt", code: "EG", phoneCode: "+20" } },
]

// Group and count cities by country
const getCountryStats = () => {
  const countryMap = new Map<string, { id: string; name: string; code: string; phoneCode: string; cityCount: number }>()
  
  MOCK_CITIES.forEach(city => {
    const existing = countryMap.get(city.country.id)
    if (existing) {
      existing.cityCount++
    } else {
      countryMap.set(city.country.id, {
        id: city.country.id,
        name: city.country.name,
        code: city.country.code,
        phoneCode: city.country.phoneCode,
        cityCount: 1,
      })
    }
  })
  
  return Array.from(countryMap.values()).sort((a, b) => b.cityCount - a.cityCount)
}

export default async function CitiesPage() {
  // In a real app, you'd fetch this data:
  // const cities = await prisma.city.findMany({ include: { country: true } })
  const cities = MOCK_CITIES
  const countries = getCountryStats()

  return (
    <>
      <PageHeader
        title="Cities"
        description="Manage delivery zones, service areas, and city configurations"
        icon={MapPin}
        actions={<CreateCityButton />}
        divider
      />

      {/* Two-column layout: Country sidebar + Main city table */}
      <div className="mt-6 grid gap-6 lg:grid-cols-12">
        {/* Left sidebar - Country summary */}
        <div className="lg:col-span-3">
          <div className="sticky top-24 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                Countries
              </h3>
              <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                {countries.length} total
              </span>
            </div>
            <CountryTable countries={countries} itemsPerPage={5} />
          </div>
        </div>

        {/* Main content - Cities table */}
        <div className="space-y-3 lg:col-span-9">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
              All Cities
            </h3>
            <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
              {cities.length} cities across {countries.length} countries
            </span>
          </div>
          <CityTable cities={cities} itemsPerPage={10} />
        </div>
      </div>
    </>
  )
}