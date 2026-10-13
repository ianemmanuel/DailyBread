import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { BackButton } from "@/components/shared/BackButton"
import { Power } from "lucide-react"
import { adminFetch } from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import { CountriesTable } from "@/components/countries/CountriesTable"
import { TableFilterBar } from "@/components/shared/TableFilterBar"
import { AdminPermissions } from "@repo/types/admin-app"
import type { CountryListResult } from "@repo/types/admin-app"

export const metadata: Metadata = { title: "Launch Queue" }
export const revalidate = 60

const PAGE_SIZE = 10

interface PageProps {
  searchParams: Promise<{ page?: string; search?: string }>
}

export default async function CountryActivationPage({ searchParams }: PageProps) {
  const session = await getAdminSession()

  // Countries (launch configuration) is restricted to super_admin and the
  // (currently global-only) operations_admin role — see /countries/page.tsx.
  if (!session.permissions.includes(AdminPermissions.SETTINGS_GEOGRAPHY_WRITE) || !session.scope.isGlobal) {
    redirect("/overview")
  }

  const { page = "1", search = "" } = await searchParams

  // This page is the launch queue — countries still being set up. Once a
  // country is activated it belongs on the main /countries view instead.
  const query = new URLSearchParams({ page, pageSize: String(PAGE_SIZE), status: "INACTIVE" })
  if (search) query.set("search", search)

  const result = await adminFetch<CountryListResult>(`/admin/v1/countries?${query.toString()}`, {
    next: { revalidate: 60, tags: ["countries"] },
  }).catch(() => null)

  const countries   = result?.countries ?? []
  const total       = result?.total ?? 0
  const totalPages  = result?.totalPages ?? 1

  const canWrite = session.permissions.includes(AdminPermissions.SETTINGS_GEOGRAPHY_WRITE)

  return (
    <div className="page-content animate-slide-up">
      <BackButton href="/countries">Back to Countries</BackButton>

      <div className="admin-card flex items-center gap-4">
        <div className="icon-badge icon-badge-primary h-12 w-12">
          <Power className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Launch Queue</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Countries not yet live. Open a country to complete its setup checklist, then activate it from there.
          </p>
        </div>
      </div>

      <TableFilterBar showSearch searchPlaceholder="Search countries…" defaultSearch={search} />

      <CountriesTable
        countries={countries}
        canWrite={canWrite}
        isGlobal={session.scope.isGlobal}
        variant="queue"
        pagination={{
          total,
          page,
          totalPages,
          basePath: "/countries/activation",
          params: search ? { search } : {},
        }}
      />
    </div>
  )
}
