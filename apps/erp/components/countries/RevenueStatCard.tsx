import { TrendingUp, ArrowUpRight, ArrowDownRight } from "lucide-react"
import { formatMockCurrency, type MockCountryRevenue } from "@/lib/mock/country-revenue"

interface Props {
  revenue: MockCountryRevenue
  label? : string
}

/**
 * STATIC — no Orders/Payments model exists yet, see lib/mock/country-revenue.ts.
 * A single stat-card figure — used on the COUNTRY-tier analytics home
 * (in place of a ranked list, which doesn't make sense for one entry) and
 * as the "revenue mini-figure" on the country detail page.
 */
export function RevenueStatCard({ revenue, label = "Revenue — Last Quarter" }: Props) {
  const isPositive = revenue.deltaPct >= 0
  return (
    <div className="stat-card">
      <div className="icon-badge icon-badge-primary h-12 w-12">
        <TrendingUp className="h-5 w-5" />
      </div>
      <div>
        <p className="stat-card-value">{formatMockCurrency(revenue.revenue)}</p>
        <p className="stat-card-label">{label}</p>
        <p className={`mt-1 inline-flex items-center gap-0.5 text-xs font-medium tabular-nums ${isPositive ? "text-success" : "text-destructive"}`}>
          {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          {Math.abs(revenue.deltaPct)}% vs prior quarter
        </p>
      </div>
    </div>
  )
}
