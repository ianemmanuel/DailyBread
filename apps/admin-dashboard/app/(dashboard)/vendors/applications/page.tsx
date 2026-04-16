import type { Metadata } from "next"
import { redirect } from "next/navigation"
import Link from "next/link"
import { auth } from "@clerk/nextjs/server"
import { FileText, Clock, CheckCircle, XCircle } from "lucide-react"
import { adminFetch }  from "@/lib/api"
import { VendorApplicationsTable } from "@/components/vendors/VendorApplicationsTable"
import { VendorApplicationFilters } from "@/components/vendors/VendorApplicationFilter"
import type { AdminSessionData, ApiSuccess } from "@repo/types/admin-app"
import { AdminPermissions } from "@repo/types/admin-app"
import type { ListAdminUsersResult  } from "@/types"

export const metadata: Metadata = { title: "Vendor Applications" }
export const revalidate = 60

interface PageProps {
  searchParams: Promise<{
    page?     : string
    search?   : string
    status?   : string
    countryId?: string
    sort?     : string
    dir?      : string
  }>
}

const STATUS_CARDS = [
  { status: "SUBMITTED",    label: "Submitted",    icon: FileText,      colorClass: "bg-info/10 text-info dark:bg-info/15" },
  { status: "UNDER_REVIEW", label: "Under Review", icon: Clock,         colorClass: "bg-warning/10 text-warning dark:bg-warning/15" },
  { status: "APPROVED",     label: "Approved",     icon: CheckCircle,   colorClass: "bg-success/10 text-success dark:bg-success/15" },
  { status: "REJECTED",     label: "Rejected",     icon: XCircle,       colorClass: "bg-danger/10 text-danger dark:bg-danger/15" },
]

export default async function VendorApplicationsPage({ searchParams }: PageProps) {
  const { getToken, userId } = await auth()
  if (!userId) redirect("/sign-in")

  const token = await getToken()
  const sessionRes = await fetch(
    `${process.env.BACKEND_API_URL}/admin/v1/auth/session`,
    { headers: { Authorization: `Bearer ${token}` }, next: { revalidate: 300 } },
  )
  if (!sessionRes.ok) redirect("/sign-in")
  const { data: session }: ApiSuccess<AdminSessionData> = await sessionRes.json()

  if (!session.permissions.includes(AdminPermissions.VENDORS_APPLICATIONS_READ)) {
    redirect("/vendors")
  }

  const params    = await searchParams
  const page      = params.page      ?? "1"
  const search    = params.search    ?? ""
  const status    = params.status    ?? ""
  const countryId = params.countryId ?? ""
  const sort      = params.sort      ?? "submittedAt"
  const dir       = params.dir       ?? "desc"
  const canApprove = session.permissions.includes(AdminPermissions.VENDORS_APPLICATIONS_APPROVE)

  const qs = new URLSearchParams({
    page, pageSize: "20",
    ...(search    ? { search }    : {}),
    ...(status    ? { status }    : {}),
    ...(countryId ? { countryId } : {}),
    sort,
    dir,
  })

  // Fetch count per status for overview cards + main list in parallel
  const [result, ...statusCounts] = await Promise.all([
    adminFetch<ListAdminUsersResult>(`/admin/v1/vendors/applications?${qs}`, {
      next: { revalidate: 60, tags: ["vendor-applications"] },
    }).catch(() => null),
    ...STATUS_CARDS.map(({ status: s }) =>
      adminFetch<ListAdminUsersResult>(`/admin/v1/vendors/applications?status=${s}&pageSize=1`, {
        next: { revalidate: 60, tags: ["vendor-applications"] },
      }).catch(() => ({ total: 0 }))
    ),
  ])

  return (
    <div className="page-content animate-slide-up">

      {/* Breadcrumb */}
      <div>
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Link href="/vendors" className="hover:text-foreground transition-colors">Vendors</Link>
          <span>/</span>
          <span className="text-foreground">Applications</span>
        </nav>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tight text-foreground">
          Applications
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review and action vendor applications.
        </p>
      </div>

      {/* Status overview cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STATUS_CARDS.map(({ status: s, label, icon: Icon, colorClass }, i) => (
          <Link
            key={s}
            href={`/vendors/applications?status=${s}`}
            className={[
              "admin-card flex items-center gap-3 transition-colors",
              status === s ? "border-primary/50" : "hover:border-primary/30",
            ].join(" ")}
          >
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${colorClass}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-semibold tabular-nums text-foreground">
                {(statusCounts[i] as any)?.total ?? 0}
              </p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Filters */}
      <VendorApplicationFilters
        defaultSearch={search}
        defaultStatus={status}
        defaultSort={sort}
        defaultDir={dir}
      />

      {/* Table */}
      <VendorApplicationsTable
        result={result}
        page={page}
        search={search}
        status={status}
        sort={sort}
        dir={dir}
        canApprove={canApprove}
      />
    </div>
  )
}