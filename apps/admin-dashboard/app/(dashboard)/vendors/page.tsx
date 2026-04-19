import type { Metadata } from "next"
import { redirect } from "next/navigation"
import Link from "next/link"
import { auth } from "@clerk/nextjs/server"
import {
  FileText, 
  Building2, 
  Clock, 
  CheckCircle, 
  XCircle, 
  ShieldAlert,
} from "lucide-react"
import { adminFetch } from "@/lib/api"
import type { AdminSessionData, ApiSuccess } from "@repo/types/admin-app"
import { AdminPermissions } from "@repo/types/admin-app"
import type { ApplicationListResult, VendorListResult } from "@/types"

export const metadata: Metadata = { title: "Vendor Operations" }
export const revalidate = 120

export default async function VendorsPage() {
  const { getToken, userId } = await auth()
  if (!userId) redirect("/sign-in")

  const token = await getToken()
  const sessionRes = await fetch(
    `${process.env.BACKEND_API_URL}/admin/v1/auth/session`,
    { headers: { Authorization: `Bearer ${token}` }, next: { revalidate: 300 } },
  )
  if (!sessionRes.ok) redirect("/sign-in")
  const { data: session }: ApiSuccess<AdminSessionData> = await sessionRes.json()

  const canReadApps     = session.permissions.includes(AdminPermissions.VENDORS_APPLICATIONS_READ)
  const canReadAccounts = session.permissions.includes(AdminPermissions.VENDORS_ACCOUNTS_READ)

  if (!canReadApps && !canReadAccounts) redirect("/overview")

  // Fetch counts in parallel — each is a lightweight count query
  const [submitted, underReview, accounts, suspended] = await Promise.all([
    canReadApps ? adminFetch<ApplicationListResult>(`/admin/v1/vendors/applications?status=SUBMITTED&pageSize=1`, {
      next: { revalidate: 120 },
    }).catch(() => ({ total: 0 })) : Promise.resolve({ total: 0 }),
    canReadApps ? adminFetch<ApplicationListResult>(`/admin/v1/vendors/applications?status=UNDER_REVIEW&pageSize=1`, {
      next: { revalidate: 120 },
    }).catch(() => ({ total: 0 })) : Promise.resolve({ total: 0 }),
    canReadAccounts ? adminFetch<VendorListResult>(`/admin/v1/vendors/accounts?pageSize=1`, {
      next: { revalidate: 120 },
    }).catch(() => ({ total: 0 })) : Promise.resolve({ total: 0 }),
    canReadAccounts ? adminFetch<VendorListResult>(`/admin/v1/vendors/accounts?status=SUSPENDED&pageSize=1`, {
      next: { revalidate: 120 },
    }).catch(() => ({ total: 0 })) : Promise.resolve({ total: 0 }),
  ])

  return (
    <div className="page-content animate-slide-up">
      <div>
        <p className="mb-1 text-xs font-mono uppercase tracking-widest text-muted-foreground/60">Operations</p>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Vendor Operations</h1>
        <p className="mt-1 text-sm text-muted-foreground">Overview of vendor applications and accounts.</p>
      </div>

      {/* Applications section */}
      {canReadApps && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Applications</h2>
            <Link href="/vendors/applications" className="text-xs text-primary hover:underline">
              View all →
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { href: "/vendors/applications?status=SUBMITTED",    icon: FileText,      label: "Submitted",    count: (submitted as any).total,    color: "bg-info/10 text-info dark:bg-info/15" },
              { href: "/vendors/applications?status=UNDER_REVIEW", icon: Clock,         label: "Under Review", count: (underReview as any).total,   color: "bg-warning/10 text-warning dark:bg-warning/15" },
              { href: "/vendors/applications?status=APPROVED",     icon: CheckCircle,   label: "Approved",     count: 0,                            color: "bg-success/10 text-success dark:bg-success/15" },
              { href: "/vendors/applications?status=REJECTED",     icon: XCircle,       label: "Rejected",     count: 0,                            color: "bg-danger/10 text-danger dark:bg-danger/15" },
            ].map(({ href, icon: Icon, label, count, color }) => (
              <Link key={label} href={href}
                className="admin-card flex items-center gap-3 transition-colors hover:border-primary/30">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${color}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-semibold tabular-nums text-foreground">{count}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Accounts section */}
      {canReadAccounts && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Accounts</h2>
            <Link href="/vendors/accounts" className="text-xs text-primary hover:underline">
              View all →
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { href: "/vendors/accounts",                  icon: Building2,   label: "Total accounts", count: (accounts  as any).total,  color: "bg-secondary" },
              { href: "/vendors/accounts?status=SUSPENDED", icon: ShieldAlert, label: "Suspended",      count: (suspended as any).total,  color: "bg-warning/10 text-warning dark:bg-warning/15" },
            ].map(({ href, icon: Icon, label, count, color }) => (
              <Link key={label} href={href}
                className="admin-card flex items-center gap-3 transition-colors hover:border-primary/30">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${color}`}>
                  <Icon className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-semibold tabular-nums text-foreground">{count}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}