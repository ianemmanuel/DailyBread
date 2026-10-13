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

/** "vendors:meals:moderate" → "Meals · Moderate": the readable name of a permission key. */
export function permissionTitle(key: string): string {
  return key.split(":").slice(1)
    .map((part) => part.replace(/_/g, " "))
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" · ")
}

/** "admin_users" → "Admin users". */
export function moduleLabel(module: string): string {
  const words = module.replace(/_/g, " ")
  return words.charAt(0).toUpperCase() + words.slice(1)
}
