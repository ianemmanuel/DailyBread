import type { Metadata } from "next"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, FileText, AlertTriangle, ShieldCheck, MapPin, Store, Wallet, TrendingUp, TrendingDown } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table"
import { adminFetch, ApiCallError } from "@/lib/api"
import { getAdminSession }     from "@/lib/auth/session"
import { getInitials }         from "@/lib/initials"
import { DocumentsSection }    from "@/components/vendors/DocumentsSection"
import { VendorAccountActions } from "@/components/vendors/VendorAccountActions"
import { VendorOutletsMap }    from "@/components/vendors/VendorOutletsMap"
import { RevenueAreaChart }    from "@/components/countries/RevenueAreaChart"
import { EmptyState }          from "@/components/shared/EmptyState"
import { ComplianceIssueBadge } from "@/components/vendors/ComplianceIssueBadge"
import { VendorPayoutAccountsSection } from "@/components/vendors/VendorPayoutAccountsSection"
import { VendorCommissionRateSection } from "@/components/vendors/VendorCommissionRateSection"
import { VendorReadinessCard } from "@/components/vendors/VendorReadinessCard"
import { LogAppealDialog }     from "@/components/vendors/LogAppealDialog"
import { getMockVendorRevenue, getMockVendorRevenueSeries, getMockOutletRevenue, formatMockCurrency } from "@/lib/mock/vendor-revenue"
import { AdminPermissions } from "@repo/types/admin-app"
import type { ComplianceIssueItem, CommissionRateHistoryEntry } from "@/types"

export const metadata: Metadata = { title: "Vendor Account" }

interface Props { params: Promise<{ id: string }> }

function StatusBadge({ status }: { status: string }) {
  const cls: Record<string, string> = {
    ACTIVE   : "badge-success",
    SUSPENDED: "badge-warning",
    BANNED   : "badge-danger",
  }
  const label: Record<string, string> = {
    ACTIVE   : "Active",
    SUSPENDED: "Suspended",
    BANNED   : "Banned",
  }
  return <span className={cls[status] ?? "badge-neutral"}>{label[status] ?? status}</span>
}

export default async function VendorAccountDetailPage({ params }: Props) {
  const { id }    = await params
  const session   = await getAdminSession()

  if (!session.permissions.includes(AdminPermissions.VENDORS_ACCOUNTS_READ)) redirect("/vendors")

  let account: any
  try {
    account = await adminFetch(`/admin/v1/vendors/accounts/${id}`, {
      next: { revalidate: 60, tags: [`vendor-account-${id}`] },
    })
  } catch (err) {
    if (err instanceof ApiCallError && err.status === 404) notFound()
    throw err
  }

  const canSuspend   = session.permissions.includes(AdminPermissions.VENDORS_ACCOUNTS_SUSPEND)
  const canReinstate = session.permissions.includes(AdminPermissions.VENDORS_ACCOUNTS_REINSTATE)
  const canBan       = session.permissions.includes(AdminPermissions.VENDORS_ACCOUNTS_BAN)
  const canManagePayouts = session.permissions.includes(AdminPermissions.VENDORS_PAYOUT_ACCOUNTS_MANAGE)
  const canManageCommission = session.permissions.includes(AdminPermissions.VENDORS_ACCOUNTS_COMMISSION_MANAGE)
  // Roadmap VM-P1-04 (CLAUDE.md) — log a formal appeal against a ban or suspension.
  const canLogAppeal = session.permissions.includes(AdminPermissions.VENDORS_APPEALS_MANAGE)
  const commissionHistory = canManageCommission
    ? await adminFetch<CommissionRateHistoryEntry[]>(`/admin/v1/vendors/accounts/${id}/commission-rate/history`, {
        next: { revalidate: 60, tags: [`vendor-account-${id}-commission`] },
      }).catch(() => [])
    : []
  const isBanned     = account.user?.isBanned ?? false
  const ownerName   = `${account.ownerFirstName ?? ""} ${account.ownerLastName ?? ""}`.trim() || "—"

  const businessFields: [string, string][] = [
    ["Business phone", account.businessPhone ?? "—"],
    ["Reg. number",    account.companyRegNumber ?? "—"],
    ["Tax ID",         account.taxRegistrationNumber ?? "—"],
    ["Address",        account.businessAddress ?? "—"],
  ]

  const ownerFields: [string, string][] = [
    ["Owner",       ownerName],
    ["Owner email", account.ownerEmail ?? "—"],
    ["Owner phone", account.ownerPhone ?? "—"],
  ]

  // STATIC — no Orders/Payments model exists yet, see lib/mock/vendor-revenue.ts.
  // A vendor's own revenue trend, aggregated across all its outlets.
  const outlets: {
    id: string; name: string; adminStatus: string; reviewStatus: string
    latitude: number; longitude: number; city: { id: string; name: string } | null
  }[] = account.outlets ?? []
  const mappableOutlets = outlets.filter((o) => o.latitude != null && o.longitude != null)
  const revenue = getMockVendorRevenue(account.id)
  const revenueSeries = getMockVendorRevenueSeries(account.id)
  const outletsByRevenue = [...outlets]
    .map((o) => ({ ...o, mockRevenue: getMockOutletRevenue(o.id) }))
    .sort((a, b) => b.mockRevenue.revenue - a.mockRevenue.revenue)

  return (
    <div className="page-content animate-slide-up">

      <Link
        href="/vendors/accounts"
        className="group inline-flex w-fit items-center gap-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card shadow-[var(--shadow-xs)] transition-all group-hover:-translate-x-0.5 group-hover:border-primary/40 group-hover:text-primary">
          <ArrowLeft className="h-4 w-4" />
        </span>
        Back to Accounts
      </Link>

      {/* Application history — the vendor account's originating application
          is already loaded server-side (account.application, included by
          getVendorAccount); this just links to its existing review page
          rather than duplicating any application data here. */}
      {account.application?.id && (
        <Link
          href={`/vendors/applications/${account.application.id}`}
          className="inline-flex w-fit items-center gap-1.5 text-sm text-primary hover:underline"
        >
          <FileText className="h-3.5 w-3.5" />
          View original application
        </Link>
      )}

      {/* Header card */}
      <div className="admin-card flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="avatar-circle h-14 w-14 shrink-0 text-lg">
            {getInitials(account.legalBusinessName)}
          </div>
          <div>
            <h1 className="font-display text-xl font-semibold text-foreground">
              {account.legalBusinessName}
            </h1>
            <p className="text-sm text-muted-foreground">{account.businessEmail}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge status={isBanned ? "BANNED" : account.status} />
              {account.vendorType?.name && <span className="badge-neutral">{account.vendorType.name}</span>}
              {account.country?.name && <span className="badge-neutral">{account.country.name}</span>}
              <span className="badge-neutral">
                {account._count?.outlets ?? 0} outlet{(account._count?.outlets ?? 0) === 1 ? "" : "s"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-start gap-3 sm:items-end">
          <div className="text-left sm:text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Joined</p>
            <p className="mt-0.5 text-sm font-medium text-foreground">
              {new Date(account.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
            </p>
          </div>
          <VendorAccountActions
            vendorId={id}
            currentStatus={account.status}
            isBanned={isBanned}
            canSuspend={canSuspend}
            canReinstate={canReinstate}
            canBan={canBan}
          />
        </div>
      </div>

      {/* Ban notice — identity-level, takes precedence over suspension */}
      {isBanned && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive-bg px-5 py-4">
          <p className="text-sm font-semibold text-destructive">Banned</p>
          <p className="mt-0.5 text-sm text-foreground">{account.user?.banReason ?? "No reason on record"}</p>
          {account.user?.bannedAt && (
            <p className="mt-1 text-xs text-muted-foreground">
              Since {new Date(account.user.bannedAt).toLocaleDateString()}
            </p>
          )}
          {canLogAppeal && (
            <div className="pt-2">
              <LogAppealDialog subjectType="ACCOUNT_BAN" vendorId={id} />
            </div>
          )}
        </div>
      )}

      {/* Suspension notice */}
      {!isBanned && account.suspensionReason && account.status !== "ACTIVE" && (
        <div className="rounded-2xl border border-warning/30 bg-warning-bg px-5 py-4">
          <p className="text-sm font-semibold text-warning">Suspended</p>
          <p className="mt-0.5 text-sm text-foreground">{account.suspensionReason}</p>
          {account.suspendedAt && (
            <p className="mt-1 text-xs text-muted-foreground">
              Since {new Date(account.suspendedAt).toLocaleDateString()}
            </p>
          )}
          {canLogAppeal && (
            <div className="pt-2">
              <LogAppealDialog subjectType="ACCOUNT_SUSPENSION" vendorId={id} />
            </div>
          )}
        </div>
      )}

      {/* Selling readiness — the authoritative getVendorGoLiveStatus, computed
          server-side in getVendorAccount. Read-only: an admin doesn't resolve
          these (the vendor does), this just shows where the vendor stands. */}
      {account.goLiveStatus && <VendorReadinessCard status={account.goLiveStatus} />}

      {/* Compliance — document expiry + missing-document visibility. Data
          comes pre-computed from getVendorAccount (account.compliance,
          only present at all if the viewer holds VENDORS_COMPLIANCE_READ);
          this only renders it. Actions (waive/notify/claim/escalate) stay
          centralized on /vendors/compliance rather than duplicated here —
          this section is read + link-out only. */}
      {account.compliance && (
        <div
          className={[
            "rounded-2xl border px-5 py-4",
            account.compliance.hasIssues ? "border-warning/30 bg-warning-bg" : "border-border/60 bg-muted/20",
          ].join(" ")}
        >
          <div className="flex items-center gap-2">
            {account.compliance.hasIssues
              ? <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
              : <ShieldCheck className="h-4 w-4 shrink-0 text-muted-foreground" />}
            <p className="text-sm font-semibold text-foreground">Compliance</p>
          </div>
          {account.compliance.hasIssues ? (
            <>
              <p className="mt-0.5 text-sm text-foreground">
                {[
                  account.compliance.missingCount > 0
                    ? `${account.compliance.missingCount} document${account.compliance.missingCount === 1 ? "" : "s"} missing`
                    : null,
                  account.compliance.expiredCount > 0
                    ? `${account.compliance.expiredCount} expired`
                    : null,
                  account.compliance.expiringCount > 0
                    ? `${account.compliance.expiringCount} expiring soon`
                    : null,
                  account.compliance.hasMissingPayoutAccount ? "no verified payout account" : null,
                ].filter(Boolean).join(" · ")}
              </p>
              <ul className="mt-3 space-y-1.5">
                {account.compliance.hasMissingPayoutAccount && (
                  <li className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-foreground">Payout account</span>
                    <span className="badge-warning">No verified account</span>
                  </li>
                )}
                {account.compliance.issues
                  .filter((i: ComplianceIssueItem) => i.issueStatus !== "WAIVED")
                  .map((issue: ComplianceIssueItem) => (
                    <li key={issue.id} className="flex items-center justify-between gap-3 text-xs">
                      <span className="text-foreground">{issue.documentType.name}</span>
                      <span className="flex items-center gap-2">
                        {issue.expiryDate && (
                          <span className="text-muted-foreground">
                            {issue.issueStatus === "EXPIRING_SOON" ? "Expires" : "Expired"} {new Date(issue.expiryDate).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                          </span>
                        )}
                        <ComplianceIssueBadge issue={issue} />
                      </span>
                    </li>
                  ))}
              </ul>
              <Link href={`/vendors/compliance/${id}`} className="view-all-link mt-3 inline-block text-xs">
                Manage compliance issues →
              </Link>
            </>
          ) : (
            <p className="mt-0.5 text-sm text-muted-foreground">No compliance issues</p>
          )}
        </div>
      )}

      {/* Business + owner details */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="admin-card space-y-4">
          <h2 className="text-sm font-semibold text-foreground">Business Details</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {businessFields.map(([label, value]) => (
              <div key={label}>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className="mt-0.5 text-sm text-foreground">{value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="admin-card space-y-4">
          <h2 className="text-sm font-semibold text-foreground">Owner &amp; Contact</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {ownerFields.map(([label, value]) => (
              <div key={label}>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className="mt-0.5 text-sm text-foreground">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <VendorPayoutAccountsSection vendorId={id} accounts={account.payoutAccounts ?? []} canManage={canManagePayouts} holdStatus={account.payoutHoldStatus ?? "NONE"} holdReason={account.payoutHoldReason ?? null} />
        {canManageCommission && (
          <VendorCommissionRateSection vendorId={id} currentRateBps={account.commissionRateBps} history={commissionHistory} canManage={canManageCommission} />
        )}
      </div>

      {/* Locations — read-only map of this vendor's outlets. Not a
          moderation surface; outlet administration itself stays deferred
          (see CLAUDE.md), this just visualizes what already exists. */}
      <div className="admin-card space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Locations</h2>
        {mappableOutlets.length === 0 ? (
          <EmptyState
            icon={MapPin}
            title="No outlets yet"
            description="This vendor hasn't added any outlets — locations will appear here once they do."
          />
        ) : (
          <VendorOutletsMap outlets={mappableOutlets} />
        )}
      </div>

      {/* Performance — mock revenue, aggregated across this vendor's outlets. */}
      {outlets.length > 0 && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="stat-card">
              <div className="icon-badge icon-badge-primary h-12 w-12">
                <Wallet className="h-5 w-5" />
              </div>
              <div>
                <p className="stat-card-value">{formatMockCurrency(revenue.revenue)}</p>
                <p className="stat-card-label">Revenue — Last Quarter</p>
              </div>
            </div>
            <div className="stat-card">
              <div className="icon-badge icon-badge-info h-12 w-12">
                <Store className="h-5 w-5" />
              </div>
              <div>
                <p className="stat-card-value">{outlets.length}</p>
                <p className="stat-card-label">Outlet{outlets.length === 1 ? "" : "s"}</p>
              </div>
            </div>
            <div className="stat-card">
              <div className={`icon-badge h-12 w-12 ${revenue.deltaPct >= 0 ? "icon-badge-success" : "icon-badge-danger"}`}>
                {revenue.deltaPct >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
              </div>
              <div>
                <p className="stat-card-value">{revenue.deltaPct >= 0 ? "+" : ""}{revenue.deltaPct}%</p>
                <p className="stat-card-label">vs Prior Quarter</p>
              </div>
            </div>
          </div>
          <p className="-mt-4 text-xs text-muted-foreground">
            Revenue is illustrative — replace once Orders/Payments ships. See the platform-wide{" "}
            <Link href="/vendors/revenue" className="view-all-link">Vendor Revenue</Link> page for how this vendor ranks.
          </p>

          <RevenueAreaChart data={revenueSeries} label={account.legalBusinessName} />
        </>
      )}

      {/* Outlets */}
      {outlets.length > 0 && (
        <div className="admin-card overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
            <h2 className="text-sm font-semibold text-foreground">
              Outlets ({outlets.length})
            </h2>
            {/* Both destinations carry the vendor filter, so an admin lands on
                this vendor's outlets or inspections rather than everyone's. */}
            <div className="flex items-center gap-3">
              <Link
                href={`/outlets/inspections?vendor=${account.id}&vendorName=${encodeURIComponent(account.legalBusinessName)}&status=`}
                className="view-all-link text-xs"
              >
                Inspections →
              </Link>
              <Link
                href={`/outlets?vendor=${account.id}&vendorName=${encodeURIComponent(account.legalBusinessName)}`}
                className="view-all-link text-xs"
              >
                Moderation →
              </Link>
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="text-xs uppercase tracking-wide">Name</TableHead>
                <TableHead className="hidden text-xs uppercase tracking-wide sm:table-cell">City</TableHead>
                <TableHead className="text-xs uppercase tracking-wide">Status</TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wide">Revenue — Last Quarter</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {outletsByRevenue.map((outlet) => (
                <TableRow key={outlet.id} className="hover:bg-muted/10">
                  <TableCell className="font-medium text-foreground">
                    <Link href={`/outlets/${outlet.id}`} className="hover:text-primary hover:underline">{outlet.name}</Link>
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                    {outlet.city?.name ?? "—"}
                  </TableCell>
                  <TableCell>
                    <span className={outlet.adminStatus === "ACTIVE" ? "badge-success" : "badge-warning"}>
                      {outlet.adminStatus === "ACTIVE" ? "Active" : outlet.adminStatus}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums text-foreground">
                    {formatMockCurrency(outlet.mockRevenue.revenue)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/*
        Documents — uses DocumentsSection (same component as application review).
        Read-only here: canActOnDocuments=false hides approve/reject, so
        statusMap is just a static snapshot of what the backend returned,
        not live-tracked state. applicationId is passed as the vendorId —
        DocumentRow only uses it for the doc-id-based view signed-url route.
      */}
      {account.documents?.length > 0 && (
        <DocumentsSection
          docs={account.documents}
          applicationId={id}
          canActOnDocuments={false}
          statusMap={Object.fromEntries(account.documents.map((d: { id: string; status: string }) => [d.id, d.status]))}
        />
      )}

    </div>
  )
}