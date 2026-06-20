import { 
  Store, 
  MapPin, 
  ShoppingBag, 
  Users, 
  TrendingUp, 
  Clock 
} from "lucide-react"
import type { CountryDetailMetrics as CountryMetricsType } from "@/types/geography.types"

interface CountryMetricsProps {
  metrics: CountryMetricsType
}

interface MetricCard {
  label:     string
  value:     string | number
  sub?:      string
  icon:      React.ElementType
  accent?:   boolean
}

export default function Metrics({ metrics }: CountryMetricsProps) {
  const cards: MetricCard[] = [
    {
      label:  "Total Vendors",
      value:  metrics.totalVendors.toLocaleString(),
      sub:    `${metrics.activeVendors.toLocaleString()} active`,
      icon:   Store,
    },
    {
      label:  "Cities",
      value:  metrics.totalCities,
      sub:    `${metrics.activeCities} operational`,
      icon:   MapPin,
    },
    {
      label:  "Total Outlets",
      value:  metrics.totalOutlets.toLocaleString(),
      icon:   ShoppingBag,
    },
    {
      label:  "Customers",
      value:  metrics.totalCustomers.toLocaleString(),
      icon:   Users,
    },
    {
      label:  "Fulfillment Rate",
      value:  `${metrics.fulfillmentRate}%`,
      icon:   TrendingUp,
      accent: metrics.fulfillmentRate >= 90,
    },
    {
      label:  "Avg Delivery",
      value:  `${metrics.avgDeliveryMins} min`,
      icon:   Clock,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 pt-6">
      {cards.map(({ label, value, sub, icon: Icon, accent }) => (
        <div
          key={label}
          className="flex flex-col gap-3 rounded-xl border p-4"
          style={{
            backgroundColor: "var(--card)",
            borderColor: "var(--border)",
          }}
        >
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg"
            style={{
              backgroundColor: accent
                ? "color-mix(in oklch, var(--success) 10%, transparent)"
                : "var(--icon-bg)",
            }}
          >
            <Icon
              className="h-4 w-4"
              style={{ color: accent ? "var(--success)" : "var(--icon-fg)" }}
            />
          </div>

          {/* Value */}
          <div>
            <p
              className="font-display text-xl font-semibold tabular-nums leading-none tracking-tight"
              style={{
                color: accent ? "var(--success)" : "var(--foreground)",
              }}
            >
              {value}
            </p>
            {sub && (
              <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
                {sub}
              </p>
            )}
          </div>

          <p
            className="text-xs font-medium"
            style={{ color: "var(--muted-foreground)" }}
          >
            {label}
          </p>
        </div>
      ))}
    </div>
  )
}