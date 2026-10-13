import type { Metadata } from "next"
import { redirect } from "next/navigation"
import Link from "next/link"
import { UserPlus } from "lucide-react"
import { adminFetch } from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import { Button } from "@/components/ui/button"
import { TableFilterBar, type FilterStatusOption, type FilterSelectOption } from "@/components/shared/TableFilterBar"
import { AdminUsersTable } from "@/components/identity/AdminUsersTable"
import { DirectorySummary } from "@/components/identity/DirectorySummary"
import type { CountryListResult } from "@repo/types/admin-app"
import { AdminPermissions } from "@repo/types/admin-app"
import type { ListAdminUsersResult } from "@/types"

export const metadata: Metadata = { title: "Identity & Access" }

interface PageProps {
  searchParams: Promise<{ page?: string; search?: string; status?: string; country?: string }>
}

const STATUS_OPTIONS: FilterStatusOption[] = [
  { value: "all",         label: "All statuses",        dot: "bg-muted-foreground/40" },
  { value: "pending",     label: "Pending invitation",  dot: "bg-info" },
  { value: "invited",     label: "Awaiting acceptance", dot: "bg-warning" },
  { value: "active",      label: "Active",              dot: "bg-success" },
  { value: "suspended",   label: "Suspended",           dot: "bg-warning" },
  { value: "deactivated", label: "Deactivated",         dot: "bg-muted-foreground" },
]

export default async function IdentityManagePage({ searchParams }: PageProps) {
  const session = await getAdminSession()
  const has = (key: string) => session.permissions.includes(key as never)
  if (!has(AdminPermissions.ADMIN_USERS_PROFILES_READ)) {
    if (has(AdminPermissions.ADMIN_USERS_ACCOUNTS_CREATE)) redirect("/identity/new")
    if (has(AdminPermissions.ADMIN_USERS_PERMISSIONS_MANAGE) || has(AdminPermissions.ADMIN_USERS_PERMISSIONS_RECOVER)) redirect("/identity/permissions")
    redirect("/overview")
  }

  const { page = "1", search = "", status = "", country = "" } = await searchParams

  // The backend scopes rows AND counts to the viewer; these params only narrow inside that.
  const qs = new URLSearchParams({
    page, pageSize: "20",
    ...(search ? { search } : {}),
    ...(status && status !== "all" ? { status } : {}),
    ...(country && country !== "all" ? { countryId: country } : {}),
  })

  // /admin/v1/countries is scope-filtered, so a single-country viewer gets one option and no picker.
  const [result, countriesResult] = await Promise.all([
    adminFetch<ListAdminUsersResult>(`/admin/v1/users?${qs}`, { next: { revalidate: 60, tags: ["admin-users"] } }).catch(() => null),
    adminFetch<CountryListResult>(`/admin/v1/countries?status=ACTIVE&pageSize=500`, { next: { revalidate: 300, tags: ["countries"] } }).catch(() => null),
  ])
  const countryOptions: FilterSelectOption[] = (countriesResult?.countries ?? []).map((c) => ({ value: c.id, label: c.name }))
  const showCountryFilter = countryOptions.length > 1

  return (
    <div className="page-content animate-slide-up">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 text-xs font-mono uppercase tracking-widest text-muted-foreground/60">Administration</p>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Identity & Access</h1>
          <p className="mt-1 text-sm text-muted-foreground">Administrators, their roles, scopes and permissions.</p>
        </div>
        {has(AdminPermissions.ADMIN_USERS_ACCOUNTS_CREATE) && (
          <Button asChild size="lg" className="group shrink-0 px-4 shadow-sm hover:-translate-y-px hover:bg-primary/90 hover:shadow-md">
            <Link href="/identity/new">
              <UserPlus className="transition-transform duration-200 group-hover:scale-110" />
              Create User
            </Link>
          </Button>
        )}
      </div>

      {result && <DirectorySummary counts={result.statusCounts} />}

      <TableFilterBar
        searchPlaceholder="Search by name, email, or employee ID…"
        defaultSearch={search}
        statusOptions={STATUS_OPTIONS}
        defaultStatus={status}
        countryOptions={showCountryFilter ? countryOptions : undefined}
        defaultCountry={country}
      />

      <AdminUsersTable
        result={result}
        page={page}
        search={search}
        status={status}
        country={country}
        showCountryColumn={showCountryFilter && (!country || country === "all")}
      />
    </div>
  )
}
