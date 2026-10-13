import type { AdminUserRef, AdminUserScope } from "@/types"

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" })

/** "13 Oct 2026" — unambiguous across locales, and identical on server and client. */
export function formatDate(value: string | Date | null | undefined): string | null {
  return value ? DATE.format(new Date(value)) : null
}

export function adminName(ref: Pick<AdminUserRef, "firstName" | "lastName">): string {
  return [ref.firstName, ref.lastName].filter(Boolean).join(" ")
}

export function scopeLabel(scopes: AdminUserScope[] | undefined): string {
  const s = scopes?.[0]
  if (!s) return "No scope"
  if (s.scopeType === "GLOBAL") return "Global"
  if (s.scopeType === "COUNTRY") return s.country?.name ?? "Country"
  return [s.city?.name, s.country?.name].filter(Boolean).join(", ") || "City"
}

export function detailHref(userId: string): string {
  return `/identity/${userId}`
}
