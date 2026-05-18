import type { Country } from "@repo/types/admin-app"
import type {
  ComplianceItem,
  VendorStats,
  CityRow,
  CountryDetailData,
  AdminRow,
  CountryDetailMetrics,
} from "@/types/geography.types"


export function buildMockDetail(country: Country): CountryDetailData {
  const metrics: CountryDetailMetrics = {
    totalVendors: country._count?.vendors ?? 532,
    activeVendors: Math.floor((country._count?.vendors ?? 532) * 0.87),
    totalCities: country._count?.cities ?? 14,
    activeCities: Math.floor((country._count?.cities ?? 14) * 0.79),
    totalOutlets: 1840,
    totalCustomers: 48200,
    fulfillmentRate: 94.2,
    avgDeliveryMins: 28,
  }

  const cities: CityRow[] = [
    {
      id: "1",
      name: "Nairobi",
      slug: `nairobi-${country.code.toLowerCase()}`,
      status: "ACTIVE",
      vendors: 320,
      outlets: 1100,
      ordersToday: 4210,
      coverage: 82,
    },
    {
      id: "2",
      name: "Mombasa",
      slug: `mombasa-${country.code.toLowerCase()}`,
      status: "ACTIVE",
      vendors: 96,
      outlets: 340,
      ordersToday: 870,
      coverage: 68,
    },
  ]

  const vendorStats: VendorStats = {
    byType: [
      { type: "Restaurant", count: 280 },
      { type: "Fast Food", count: 145 },
      { type: "Bakery", count: 62 },
    ],
    recentCount: 47,
    suspended: 12,
    topPerformer: "Nairobi Kitchen Co.",
  }

  const compliance: ComplianceItem[] = [
    {
      id: "1",
      label: "Business Registration",
      status: "OK",
      note: "All vendors verified",
    },
  ]

  const admins: AdminRow[] = [
    {
      id: "1",
      name: "Bryce  Nolan",
      role: "Country Admin",
      city: null,
      status: "ACTIVE",
    },
  ]

  return {
    country,
    metrics,
    cities,
    vendorStats,
    compliance,
    admins,
  }
}
