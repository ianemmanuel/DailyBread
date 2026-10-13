import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Store, FileText, Building2, MapPin, ShieldAlert, Scale, UserCheck, TrendingUp } from "lucide-react"
import { adminFetch } from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import { AdminPermissions } from "@repo/types/admin-app"
import { VendorsSectionsGrid, type VendorSectionCard } from "@/components/vendors/home/VendorsSectionsGrid"
import type { ApplicationListResult, VendorListResult, ComplianceGroupsResult, VendorAppealListResult, VendorProfileListResult, AdminOutletListResult } from "@/types"

export const metadata: Metadata = { title: "Vendors" }
export const revalidate = 120

async function count(path: string): Promise<number> {
  return adminFetch<{ total: number }>(path, { next: { revalidate: 120 } })
    .then((r) => r.total)
    .catch(() => 0)
}

/**
 * Permission-gated grid of every /vendors/* section — replaces the old
 * two-card (Applications/Accounts only) home, which under-represented
 * Outlets/Compliance/Appeals/Profiles/Revenue once those shipped. "How
 * application review works" moved to a button + AlertDialog at the
 * bottom of /vendors/applications — this page's job is orientation
 * across the whole module, not a workflow explainer for one part of it.
 */
export default async function VendorsPage() {
  const session = await getAdminSession()
  const has = (p: (typeof AdminPermissions)[keyof typeof AdminPermissions]) => session.permissions.includes(p)

  const canReadApps       = has(AdminPermissions.VENDORS_APPLICATIONS_READ)
  const canReadAccounts   = has(AdminPermissions.VENDORS_ACCOUNTS_READ)
  const canReadOutlets    = has(AdminPermissions.VENDORS_OUTLETS_READ)
  const canReadCompliance = has(AdminPermissions.VENDORS_COMPLIANCE_READ)
  const canReadAppeals    = has(AdminPermissions.VENDORS_APPEALS_READ)
  const canReadProfiles   = has(AdminPermissions.VENDORS_PROFILES_READ)

  if (!canReadApps && !canReadAccounts && !canReadOutlets && !canReadCompliance && !canReadAppeals && !canReadProfiles) {
    redirect("/overview")
  }

  const [
    pendingApps, activeAccounts, flaggedOutlets, complianceGroups, openAppeals, flaggedProfiles,
  ] = await Promise.all([
    canReadApps
      ? adminFetch<ApplicationListResult>(`/admin/v1/vendors/applications?status=SUBMITTED&pageSize=1`, { next: { revalidate: 120 } }).catch(() => ({ total: 0 }))
      : Promise.resolve({ total: 0 }),
    canReadAccounts
      ? adminFetch<VendorListResult>(`/admin/v1/vendors/accounts?status=ACTIVE&pageSize=1`, { next: { revalidate: 120 } }).catch(() => ({ total: 0 }))
      : Promise.resolve({ total: 0 }),
    canReadOutlets
      ? adminFetch<AdminOutletListResult>(`/admin/v1/vendors/outlets?reviewStatus=FLAGGED&pageSize=1`, { next: { revalidate: 120 } }).catch(() => ({ total: 0 }))
      : Promise.resolve({ total: 0 }),
    canReadCompliance
      ? adminFetch<ComplianceGroupsResult>(`/admin/v1/vendors/compliance/by-vendor?pageSize=1`, { next: { revalidate: 120 } }).catch(() => ({ total: 0 }))
      : Promise.resolve({ total: 0 }),
    canReadAppeals
      ? adminFetch<VendorAppealListResult>(`/admin/v1/vendors/appeals?status=OPEN&pageSize=1`, { next: { revalidate: 120 } }).catch(() => ({ total: 0 }))
      : Promise.resolve({ total: 0 }),
    canReadProfiles
      ? adminFetch<VendorProfileListResult>(`/admin/v1/vendors/profiles?status=FLAGGED&pageSize=1`, { next: { revalidate: 120 } }).catch(() => ({ total: 0 }))
      : Promise.resolve({ total: 0 }),
  ])

  const cards: VendorSectionCard[] = []
  if (canReadApps) cards.push({
    href: "/vendors/applications", icon: FileText, badgeClass: "icon-badge-primary",
    title: "Applications", description: "Claim, review, and decide on vendor onboarding applications.",
    count: pendingApps.total, countLabel: "awaiting review",
  })
  if (canReadAccounts) cards.push({
    href: "/vendors/accounts", icon: Building2, badgeClass: "icon-badge-success",
    title: "Accounts", description: "Manage live vendor accounts — suspend, reinstate, or ban.",
    count: activeAccounts.total, countLabel: "active on the platform",
  })
  if (canReadOutlets) cards.push({
    href: "/outlets", icon: MapPin, badgeClass: "icon-badge-warning",
    title: "Outlets", description: "Cross-vendor outlet moderation and suspend/ban controls.",
    count: flaggedOutlets.total, countLabel: "flagged for review", urgent: true,
  })
  if (canReadCompliance) cards.push({
    href: "/vendors/compliance", icon: ShieldAlert, badgeClass: "icon-badge-danger",
    title: "Compliance", description: "Missing, expired, or expiring documents — plus payout-account issues, by vendor.",
    count: complianceGroups.total, countLabel: "vendors with open issues", urgent: true,
  })
  if (canReadAppeals) cards.push({
    href: "/vendors/appeals", icon: Scale, badgeClass: "icon-badge-info",
    title: "Appeals", description: "Formal appeals against a rejection, suspension, or ban.",
    count: openAppeals.total, countLabel: "open",
  })
  if (canReadProfiles) cards.push({
    href: "/vendors/profiles", icon: UserCheck, badgeClass: "icon-badge-warning",
    title: "Profiles", description: "Public-profile moderation — flagged for content or a duplicate name.",
    count: flaggedProfiles.total, countLabel: "flagged", urgent: true,
  })
  if (has(AdminPermissions.FINANCE_REPORTS_READ)) cards.push({
    href: "/finance/vendors", icon: TrendingUp, badgeClass: "icon-badge-info",
    title: "Revenue", description: "Top vendors by outlet revenue, trend, and who needs attention.",
  })

  return (
    <div className="page-content animate-slide-up">
      <div className="admin-card flex items-center gap-4">
        <div className="icon-badge icon-badge-primary h-12 w-12">
          <Store className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Vendors</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Onboard, review, and manage every vendor on the platform.
          </p>
        </div>
      </div>

      <VendorsSectionsGrid cards={cards} />
    </div>
  )
}
