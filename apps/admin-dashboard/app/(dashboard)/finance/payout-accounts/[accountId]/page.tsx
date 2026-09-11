import type { Metadata } from "next"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Landmark, AlertTriangle, FileText } from "lucide-react"
import { adminFetch, ApiCallError } from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import { PayoutAccountReviewActions } from "@/components/finance/PayoutAccountReviewActions"
import { PayoutProofSheet } from "@/components/finance/PayoutProofSheet"
import { PayoutReviewActions } from "@/components/finance/PayoutReviewActions"
import { PayoutDecidedActions } from "@/components/finance/PayoutDecidedActions"
import { PayoutAuditHistory } from "@/components/finance/PayoutAuditHistory"
import {
  PAYOUT_STATUS_BADGE, PAYOUT_STATUS_LABEL, PAYOUT_FAILURE_LABEL,
} from "@/components/finance/payout-account-status"
import { AdminPermissions } from "@repo/types/admin-app"
import type { AdminPayoutAccountDetail } from "@repo/types/admin-app"

export const metadata: Metadata = { title: "Payout Account" }
export const revalidate = 15

const RISK_LABEL: Record<string, string> = {
  NAME_MISMATCH       : "Account-holder name doesn't match the vendor",
  ADD_VELOCITY        : "Many payout accounts added recently",
  DUPLICATE_IDENTIFIER: "Identifier used by another vendor in this country",
}

interface PageProps { params: Promise<{ accountId: string }> }

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border/50 py-2 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{children}</span>
    </div>
  )
}

export default async function PayoutAccountDetailPage({ params }: PageProps) {
  const session = await getAdminSession()
  if (!session.permissions.includes(AdminPermissions.FINANCE_PAYOUTS_READ)) redirect("/overview")
  const canManage = session.permissions.includes(AdminPermissions.VENDORS_PAYOUT_ACCOUNTS_MANAGE)
  const canReview = {
    claim   : session.permissions.includes(AdminPermissions.VENDORS_PAYOUT_ACCOUNTS_CLAIM),
    escalate: session.permissions.includes(AdminPermissions.VENDORS_PAYOUT_ACCOUNTS_ESCALATE),
    reassign: session.permissions.includes(AdminPermissions.VENDORS_PAYOUT_ACCOUNTS_REASSIGN),
  }

  const { accountId } = await params

  let detail: AdminPayoutAccountDetail
  try {
    detail = await adminFetch<AdminPayoutAccountDetail>(`/admin/v1/finance/payout-accounts/${accountId}`, {
      next: { revalidate: 15, tags: ["finance-payout-accounts"] },
    })
  } catch (err) {
    if (err instanceof ApiCallError && err.status === 404) notFound()
    throw err
  }

  const a = detail.account
  const lifecycleStatus = a.isActive ? a.verificationStatus : "DEACTIVATED"
  // VERIFIED / FAILED are the terminal verification outcomes — the same set
  // payoutReviewState treats as RESOLVED on the backend.
  const isDecided = a.verificationStatus === "VERIFIED" || a.verificationStatus === "FAILED"
  const identifier = `${a.bankName ?? a.methodName} ${a.maskedAccount}`

  return (
    <div className="page-content animate-slide-up">
      <Link
        href="/finance/payout-accounts"
        className="group inline-flex w-fit items-center gap-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card shadow-[var(--shadow-xs)] transition-all group-hover:-translate-x-0.5 group-hover:border-primary/40 group-hover:text-primary">
          <ArrowLeft className="h-4 w-4" />
        </span>
        Back to payout accounts
      </Link>

      <div className="admin-card flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="icon-badge icon-badge-primary h-12 w-12"><Landmark className="h-5 w-5" /></div>
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
              {a.bankName ?? a.methodName} <span className="font-mono text-base text-muted-foreground">{a.maskedAccount}</span>
            </h1>
            <p className="mt-0.5 flex items-center gap-2 text-sm text-muted-foreground">
              <Link href={`/vendors/accounts/${a.vendorId}`} className="hover:text-primary hover:underline">{a.vendorName}</Link>
              <span>· {a.countryName}</span>
              <span className={PAYOUT_STATUS_BADGE[lifecycleStatus]}>{PAYOUT_STATUS_LABEL[lifecycleStatus]}</span>
              {a.isDefault && a.isActive && <span className="badge-info">Default</span>}
            </p>
          </div>
        </div>
        {/*
          Two mutually exclusive action sets. While the review is live: verify
          and reject, and only for the admin who actually holds the claim,
          since the backend requires it. Once the verification is final,
          reject would overwrite a completed decision as a failure — so
          deactivate and flag-for-senior-review take its place.
        */}
        {canManage && a.isActive && !isDecided && (
          <PayoutAccountReviewActions
            accountId={a.id}
            identifier={identifier}
            verificationStatus={a.verificationStatus}
            canVerify={detail.canVerify}
            verifyBlockedReason={detail.verifyBlockedReason}
            canManage={canManage}
            isClaimedByMe={detail.assignedReviewerId === session.id}
            variant="full"
          />
        )}
        {canManage && isDecided && (
          <PayoutDecidedActions
            accountId={a.id}
            identifier={identifier}
            vendorName={a.vendorName}
            isActive={a.isActive}
            canManage={canManage}
          />
        )}
      </div>

      {/* Review workflow — claim before deciding, then escalate to the
          open in-country pool or reassign to a named admin. */}
      {detail.reviewState !== "RESOLVED" && (
        <div className="admin-card flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            <span className="text-muted-foreground">Review: </span>
            <span className="font-medium">
              {detail.reviewState === "CLAIMED"
                ? `Claimed by ${detail.assignedTo ?? "an admin"}`
                : detail.reviewState === "ESCALATED"
                  ? "Escalated — waiting in the open pool"
                  : "Unclaimed"}
            </span>
            {detail.escalationReason && detail.reviewState === "ESCALATED" && (
              <p className="mt-0.5 text-xs text-muted-foreground">{detail.escalationReason}</p>
            )}
          </div>
          <PayoutReviewActions
            accountId={a.id}
            vendorName={a.vendorName}
            detail={detail}
            actorId={session.id}
            can={canReview}
          />
        </div>
      )}

      {detail.verifyBlockedReason && a.verificationStatus !== "VERIFIED" && (
        <div className="admin-card flex items-start gap-2 border-l-2 border-l-warning/60 text-sm text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <span>{detail.verifyBlockedReason}</span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="admin-card">
          <h2 className="mb-2 text-sm font-semibold text-foreground">Account</h2>
          <Row label="Vendor">
            <Link href={`/vendors/accounts/${a.vendorId}`} className="hover:text-primary hover:underline">{a.vendorName}</Link>
          </Row>
          <Row label="Country">{a.countryName} ({a.countryCode})</Row>
          <Row label="Payment method">{a.methodName} · {a.methodType}</Row>
          <Row label="Bank">{a.bankName ?? "—"}</Row>
          <Row label="Bank code">
            {detail.bankCode ? <span className="font-mono">{detail.bankCode}</span> : "—"}
          </Row>
          <Row label="Branch">{a.branchName ?? "—"}</Row>
          <Row label="Account holder">{a.accountHolderName ?? "—"}</Row>
          <Row label="Account identifier"><span className="font-mono">{a.maskedAccount}</span></Row>
          <Row label="Currency">{a.currency}</Row>
        </div>

        <div className="admin-card">
          <h2 className="mb-2 text-sm font-semibold text-foreground">Verification</h2>
          <Row label="Status">
            <span className={PAYOUT_STATUS_BADGE[lifecycleStatus]}>{PAYOUT_STATUS_LABEL[lifecycleStatus]}</span>
          </Row>
          <Row label="Provider">{a.providerName ?? "—"}{a.environment ? ` · ${a.environment}` : ""}</Row>
          <Row label="Verification method">{a.verificationMethod ?? "—"}</Row>
          <Row label="Reason">
            {a.verificationFailureCode ? PAYOUT_FAILURE_LABEL[a.verificationFailureCode] : (a.failureReason ?? "—")}
          </Row>
          {a.failureReason && (
            <Row label="Detail"><span className="text-muted-foreground">{a.failureReason}</span></Row>
          )}
          <Row label="Name match">
            {a.nameMatchScore != null ? `${Math.round(a.nameMatchScore * 100)}%` : "not checked"}
          </Row>
          <Row label="Reviewed by">
            {detail.reviewedBy
              ? <>{detail.reviewedBy}{detail.reviewedAt ? ` · ${new Date(detail.reviewedAt).toLocaleString()}` : ""}</>
              : "—"}
          </Row>
          <Row label="Verified at">{a.verifiedAt ? new Date(a.verifiedAt).toLocaleString() : "—"}</Row>
          <Row label="Created">{new Date(a.createdAt).toLocaleString()}</Row>
          <Row label="Updated">{new Date(a.updatedAt).toLocaleString()}</Row>
          {a.riskFlags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {a.riskFlags.map((f) => (
                <span key={f} className="inline-flex items-center gap-1 rounded-full bg-warning-bg px-2 py-0.5 text-[11px] font-medium text-warning">
                  <AlertTriangle className="h-2.5 w-2.5" />
                  {RISK_LABEL[f] ?? f}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/*
        Proof of ownership — the MANUAL verification path. In markets with no
        bank-resolution provider this document is the evidence the decision
        rests on, so it sits directly above the audit trail rather than being
        a click away. Check the holder's name against the vendor's legal name,
        the account number against the masked identifier above, and that the
        document is stamped by the bank. Absent for countries that verify
        automatically.
      */}
      {detail.proofDocuments.length > 0 && (
        <div className="admin-card">
          <h2 className="mb-1 text-sm font-semibold text-foreground">Proof of account ownership</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Uploaded by the vendor because this country has no automatic bank verification. Confirm the
            holder&apos;s name matches the vendor&apos;s legal name and that the document is stamped by the bank.
          </p>
          <ul className="space-y-2">
            {detail.proofDocuments.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center gap-3 rounded-md border border-border px-3 py-2"
              >
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{d.documentName ?? d.typeName}</p>
                  <p className="text-xs text-muted-foreground">
                    {d.typeName} · uploaded {new Date(d.uploadedAt).toLocaleString()}
                  </p>
                </div>
                <PayoutProofSheet doc={d}>
                  <button
                    type="button"
                    className="shrink-0 cursor-pointer rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted"
                  >
                    View
                  </button>
                </PayoutProofSheet>
              </li>
            ))}
          </ul>
        </div>
      )}

      <PayoutAuditHistory
        accountId={a.id}
        initial={detail.audit}
        total={detail.auditTotal}
        pageSize={detail.auditPageSize}
      />
    </div>
  )
}
