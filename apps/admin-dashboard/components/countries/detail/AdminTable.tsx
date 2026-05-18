import type { AdminRow } from "@/types/geography.types"

interface CountryAdminTableProps {
  admins: AdminRow[]
}

export function CountryAdminTable({ admins }: CountryAdminTableProps) {
  return (
    <div
      className="overflow-hidden rounded-xl border"
      style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              {["Name", "Role", "City scope", "Status"].map((col) => (
                <th
                  key={col}
                  className="whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase tracking-wider first:pl-5 last:pr-5"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {admins.map((admin, i) => (
              <tr
                key={admin.id}
                className="group transition-colors duration-100 hover:bg-[var(--accent)]"
                style={{
                  borderBottom:
                    i < admins.length - 1 ? "1px solid var(--border)" : undefined,
                }}
              >
                {/* Name + avatar */}
                <td className="px-4 py-3 pl-5">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                      style={{
                        backgroundColor: "color-mix(in oklch, var(--primary) 10%, transparent)",
                        color: "var(--primary)",
                      }}
                    >
                      {admin.name
                        .split(" ")
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join("")
                        .toUpperCase()}
                    </div>
                    <span className="font-medium" style={{ color: "var(--foreground)" }}>
                      {admin.name}
                    </span>
                  </div>
                </td>

                {/* Role */}
                <td className="px-4 py-3">
                  <span
                    className="text-xs"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    {admin.role}
                  </span>
                </td>

                {/* City scope */}
                <td className="px-4 py-3">
                  {admin.city ? (
                    <span
                      className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium"
                      style={{
                        backgroundColor: "var(--muted)",
                        color: "var(--foreground)",
                      }}
                    >
                      {admin.city}
                    </span>
                  ) : (
                    <span
                      className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium"
                      style={{
                        backgroundColor: "color-mix(in oklch, var(--primary) 8%, transparent)",
                        color: "var(--primary)",
                      }}
                    >
                      Country-wide
                    </span>
                  )}
                </td>

                {/* Status */}
                <td className="px-4 py-3 pr-5">
                  <span
                    className="inline-flex items-center gap-1 text-[11px] font-semibold"
                    style={{
                      color: admin.status === "ACTIVE" ? "var(--success)" : "var(--muted-foreground)",
                    }}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{
                        backgroundColor:
                          admin.status === "ACTIVE" ? "var(--success)" : "var(--muted-foreground)",
                      }}
                    />
                    {admin.status === "ACTIVE" ? "Active" : "Inactive"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}