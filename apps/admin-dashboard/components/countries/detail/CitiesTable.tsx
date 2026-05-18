import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { GeoStatusBadge } from "@/components/geography/shared/GeoStatusBadge"
import type { CityRow } from "@/types/geography.types"

interface CountryCitiesTableProps {
  cities:      CityRow[]
  countrySlug: string
}

export function CountryCitiesTable({ cities, countrySlug }: CountryCitiesTableProps) {
  return (
    <div
      className="overflow-hidden rounded-xl border"
      style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
    >
      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              {["City", "Vendors", "Outlets", "Orders today", "Coverage", "Status", ""].map(
                (col) => (
                  <th
                    key={col}
                    className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-wider first:pl-5 last:pr-5"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    {col}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {cities.map((city, i) => (
              <tr
                key={city.id}
                style={{
                  borderBottom:
                    i < cities.length - 1 ? "1px solid var(--border)" : undefined,
                }}
                className="group transition-colors duration-100 hover:bg-[var(--accent)]"
              >
                {/* City name */}
                <td className="px-4 py-3 pl-5">
                  <span
                    className="font-medium"
                    style={{ color: "var(--foreground)" }}
                  >
                    {city.name}
                  </span>
                </td>

                {/* Vendors */}
                <td className="px-4 py-3 tabular-nums" style={{ color: "var(--foreground)" }}>
                  {city.vendors.toLocaleString()}
                </td>

                {/* Outlets */}
                <td className="px-4 py-3 tabular-nums" style={{ color: "var(--foreground)" }}>
                  {city.outlets.toLocaleString()}
                </td>

                {/* Orders today */}
                <td className="px-4 py-3 tabular-nums" style={{ color: "var(--foreground)" }}>
                  {city.status === "ACTIVE"
                    ? city.ordersToday.toLocaleString()
                    : <span style={{ color: "var(--muted-foreground)" }}>—</span>
                  }
                </td>

                {/* Coverage */}
                <td className="px-4 py-3">
                  {city.status === "ACTIVE" ? (
                    <div className="flex items-center gap-2">
                      {/* Mini progress bar */}
                      <div
                        className="h-1.5 w-16 overflow-hidden rounded-full"
                        style={{ backgroundColor: "var(--muted)" }}
                      >
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${city.coverage}%`,
                            backgroundColor:
                              city.coverage >= 70
                                ? "var(--success)"
                                : city.coverage >= 45
                                  ? "var(--warning)"
                                  : "var(--destructive)",
                          }}
                        />
                      </div>
                      <span
                        className="tabular-nums text-xs"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        {city.coverage}%
                      </span>
                    </div>
                  ) : (
                    <span style={{ color: "var(--muted-foreground)" }}>—</span>
                  )}
                </td>

                {/* Status */}
                <td className="px-4 py-3">
                  <GeoStatusBadge status={city.status} />
                </td>

                {/* Action */}
                <td className="px-4 py-3 pr-5 text-right">
                  <Link
                    href={`/cities/${city.slug}`}
                    className="inline-flex items-center gap-1 text-xs font-medium opacity-0 transition-all duration-150 group-hover:opacity-100"
                    style={{ color: "var(--primary)" }}
                  >
                    Open
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div
        className="flex items-center justify-between border-t px-5 py-3"
        style={{ borderColor: "var(--border)" }}
      >
        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          {cities.filter((c) => c.status === "ACTIVE").length} of {cities.length} cities operational
        </p>
        <Link
          href={`/countries/${countrySlug}/cities`}
          className="text-xs font-medium transition-colors duration-150"
          style={{ color: "var(--primary)" }}
        >
          Manage cities →
        </Link>
      </div>
    </div>
  )
}