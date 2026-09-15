import type { Metadata } from "next"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, AlertTriangle, Wallet, ShieldCheck } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { adminFetch, ApiCallError } from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import { getInitials } from "@/lib/initials"
import { EmptyState } from "@/components/shared/EmptyState"
import { ComplianceIssueActions } from "@/components/vendors/ComplianceIssueActions"
import { ComplianceIssueBadge } from "@/components/vendors/ComplianceIssueBadge"
import { ComplianceVendorHeaderActions } from "@/components/vendors/ComplianceVendorHeaderActions"
import { AdminPermissions } from "@repo/types/admin-app"
import type { ComplianceSeverity, VendorComplianceDetail } from "@/types"

export const metadata: Metadata = { title: "Vendor Compliance" }

interface Props { params: Promise<{ vendorId: string }> }

const SEVERITY_LABEL: Record<ComplianceSeverity, string> = { CRITICAL: "Critical", MEDIUM: "Medium", LOW: "Low" }
const SEVERITY_CLASS: Record<ComplianceSeverity, string> = {
  CRITICAL: "badge-danger", MEDIUM: "badge-warning", LOW: "badge-neutral",
}

/*
 * One vendor's full compliance picture — see CLAUDE.md's compliance-
 * ownership decision. Per-issue actions here are identical to the old
 * flat /vendors/compliance table's row actions (same ComplianceIssueActions
 * component); the only thing that moved is where they live.
 */
export default async function VendorComplianceDetailPage({ params }: Props) {
  const { vendorId } = await params
  const session = await getAdminSession()

  if (!session.permissions.includes(AdminPermissions.VENDORS_COMPLIANCE_READ)) redirect("/vendors")

  const canManage   = session.permissions.includes(AdminPermissions.VENDORS_ACCOUNTS_COMPLIANCE_MANAGE)
  const canClaim    = session.permissions.includes(AdminPermissions.VENDORS_COMPLIANCE_CLAIM)
  const canEscalate = session.permissions.includes(AdminPermissions.VENDORS_COMPLIANCE_ESCALATE)
  const canReassign = session.permissions.includes(AdminPermissions.VENDORS_COMPLIANCE_REASSIGN)

  let detail: VendorComplianceDetail
  try {
    detail = await adminFetch<VendorComplianceDetail>(`/admin/v1/vendors/compliance/vendor/${vendorId}`, {
      next: { revalidate: 30, tags: [`vendor-compliance-${vendorId}`, "vendor-compliance"] },
    })
  } catch (err) {
    if (err instanceof ApiCallError && err.status === 404) notFound()
    throw err
  }

  const { vendor, issues, operational } = detail
  const liveIssues = issues.filter((i) => i.issueStatus !== "WAIVED")
  const waivedIssues = issues.filter((i) => i.issueStatus === "WAIVED")
  const hasClaimable = liveIssues.some((i) => !i.case?.assignedReviewerId)
  const worstSeverity: ComplianceSeverity = operational.hasMissingPayoutAccount
    ? "CRITICAL"
    : liveIssues.reduce<ComplianceSeverity>((worst, i) => {
        const rank: Record<ComplianceSeverity, number> = { CRITICAL: 0, MEDIUM: 1, LOW: 2 }
        return rank[i.severity] < rank[worst] ? i.severity : worst
      }, "LOW")

  return (
    <div className="page-content animate-slide-up">
      <Link
        href="/vendors/compliance"
        className="group inline-flex w-fit items-center gap-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card shadow-[var(--shadow-xs)] transition-all group-hover:-translate-x-0.5 group-hover:border-primary/40 group-hover:text-primary">
          <ArrowLeft className="h-4 w-4" />
        </span>
        Back to Compliance
      </Link>

      <div className="admin-card flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="avatar-circle h-14 w-14 shrink-0 text-lg">
            {getInitials(vendor.legalBusinessName)}
          </div>
          <div>
            <h1 className="font-display text-xl font-semibold text-foreground">{vendor.legalBusinessName}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={SEVERITY_CLASS[worstSeverity]}>{SEVERITY_LABEL[worstSeverity]} — worst issue</span>
              <span className="badge-neutral">{liveIssues.length + (operational.hasMissingPayoutAccount ? 1 : 0)} open issue{(liveIssues.length + (operational.hasMissingPayoutAccount ? 1 : 0)) === 1 ? "" : "s"}</span>
            </div>
            <Link href={`/vendors/accounts/${vendor.id}`} className="view-all-link mt-2 inline-block text-xs">
              View vendor account →
            </Link>
          </div>
        </div>

        <ComplianceVendorHeaderActions
          vendorId={vendor.id}
          canClaim={canClaim}
          hasClaimable={hasClaimable}
          canManage={canManage}
          hasMissingPayoutAccount={operational.hasMissingPayoutAccount}
        />
      </div>

      {/* Operational — missing payout account. Not a VendorComplianceCase
          (see CLAUDE.md) — no claim/waive workflow, just visibility + a
          notify nudge (in the header actions above) and a link to the
          fix. */}
      {operational.hasMissingPayoutAccount && (
        <div className="rounded-2xl border border-warning/30 bg-warning-bg px-5 py-4">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 shrink-0 text-warning" />
            <p className="text-sm font-semibold text-foreground">Operational — No verified payout account</p>
          </div>
          <p className="mt-0.5 text-sm text-foreground">
            This vendor is active but has no verified bank, mobile money, or wallet account on file — they can&apos;t receive payouts until they add one.
          </p>
          <Link href={`/vendors/accounts/${vendor.id}`} className="view-all-link mt-2 inline-block text-xs">
            Go to payout accounts →
          </Link>
        </div>
      )}

      {liveIssues.length === 0 && !operational.hasMissingPayoutAccount ? (
        <EmptyState icon={ShieldCheck} title="No open compliance issues" description="Everything for this vendor is either fine or waived — see the waived list below if any." />
      ) : (
        <div className="admin-card overflow-hidden p-0">
          <div className="border-b border-border/60 px-5 py-3">
            <h2 className="text-sm font-semibold text-foreground">Document issues ({liveIssues.length})</h2>
          </div>
          {liveIssues.length === 0 ? (
            <div className="p-5"><EmptyState icon={AlertTriangle} title="No open document issues" description="Only the operational issue above needs attention." /></div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="text-xs uppercase tracking-wide">Document Type</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide">Status</TableHead>
                    <TableHead className="hidden text-xs uppercase tracking-wide md:table-cell">Severity</TableHead>
                    <TableHead className="hidden text-xs uppercase tracking-wide lg:table-cell">Owner</TableHead>
                    <TableHead className="hidden text-xs uppercase tracking-wide md:table-cell">Expiry Date</TableHead>
                    <TableHead className="text-right text-xs uppercase tracking-wide">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {liveIssues.map((issue) => (
                    <TableRow key={issue.id} className="hover:bg-muted/10">
                      <TableCell className="font-medium text-foreground">{issue.documentType.name}</TableCell>
                      <TableCell><ComplianceIssueBadge issue={issue} /></TableCell>
                      <TableCell className="hidden md:table-cell">
                        <span className={SEVERITY_CLASS[issue.severity]}>{SEVERITY_LABEL[issue.severity]}</span>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                        {issue.case?.escalatedByAdminId
                          ? <span className="text-destructive">Escalated{issue.case.escalatedByAdminName ? ` by ${issue.case.escalatedByAdminName}` : ""}</span>
                          : issue.case?.assignedReviewerId
                            ? issue.case.assignedReviewerName ?? "Claimed"
                            : "Unclaimed"}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <span className="font-mono text-xs text-muted-foreground">
                          {issue.expiryDate ? new Date(issue.expiryDate).toLocaleDateString() : "—"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <ComplianceIssueActions issue={issue} canManage={canManage} canClaim={canClaim} canEscalate={canEscalate} canReassign={canReassign} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      )}

      {waivedIssues.length > 0 && (
        <div className="admin-card overflow-hidden p-0">
          <div className="border-b border-border/60 px-5 py-3">
            <h2 className="text-sm font-semibold text-foreground">Waived ({waivedIssues.length})</h2>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="text-xs uppercase tracking-wide">Document Type</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide">Status</TableHead>
                  <TableHead className="hidden text-xs uppercase tracking-wide md:table-cell">Waiver Expires</TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wide">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {waivedIssues.map((issue) => (
                  <TableRow key={issue.id} className="hover:bg-muted/10">
                    <TableCell className="font-medium text-foreground">{issue.documentType.name}</TableCell>
                    <TableCell><ComplianceIssueBadge issue={issue} /></TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="font-mono text-xs text-muted-foreground">
                        {issue.waiver?.expiresAt ? new Date(issue.waiver.expiresAt).toLocaleDateString() : "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <ComplianceIssueActions issue={issue} canManage={canManage} canClaim={canClaim} canEscalate={canEscalate} canReassign={canReassign} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  )
}
