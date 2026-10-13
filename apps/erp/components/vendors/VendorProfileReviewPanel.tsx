import Link from "next/link"
import { Flag, ShieldCheck, Clock, Undo2, CheckCircle2, ExternalLink } from "lucide-react"
import type { VendorProfileAdminDetail } from "@/types"
import { describeFlag, FLAG_REASON_LABEL } from "./profile-flag-meta"
import { VendorProfileReviewActions } from "./VendorProfileReviewActions"

/**
 * The decision column: what fired, what state it is in, what happened before,
 * and the two buttons. Kept beside the preview rather than under it so a
 * moderator never scrolls away from the evidence to act on it.
 */

interface Props {
  profile        : VendorProfileAdminDetail
  canModerate    : boolean
  suggestedReason: string
}

const STATUS_META: Record<string, { label: string; badge: string; note: string }> = {
  FLAGGED: {
    label: "Needs review",
    badge: "badge-warning",
    note : "Automated screening flagged this. It cannot go live until someone decides.",
  },
  AUTO_APPROVED: {
    label: "Auto-approved",
    badge: "badge-success",
    note : "Nothing was flagged, so no one needed to look at it. You can still act on it.",
  },
  MANUALLY_APPROVED: {
    label: "Approved",
    badge: "badge-success",
    note : "An admin cleared this. Publishing is still the vendor's own decision.",
  },
  MANUALLY_REJECTED: {
    label: "Sent back for revision",
    badge: "badge-danger",
    note : "The vendor has been told what to change. Editing a flagged field returns it here automatically.",
  },
}

function fmt(value: string | null): string | null {
  return value ? new Date(value).toLocaleString() : null
}

export function VendorProfileReviewPanel({ profile, canModerate, suggestedReason }: Props) {
  const status = STATUS_META[profile.reviewStatus] ?? {
    label: profile.reviewStatus, badge: "badge-neutral", note: "",
  }

  const flags = profile.flagDetails && profile.flagDetails.length > 0
    ? profile.flagDetails.map(describeFlag)
    : profile.flagReasons.map((r) => FLAG_REASON_LABEL[r] ?? r)

  const timeline = [
    { icon: Clock,        label: "Profile created",  at: fmt(profile.createdAt) },
    { icon: Flag,         label: "Flagged",          at: fmt(profile.flaggedAt) },
    { icon: CheckCircle2, label: "Went live",        at: fmt(profile.publishedAt) },
    {
      icon : profile.reviewStatus === "MANUALLY_REJECTED" ? Undo2 : ShieldCheck,
      label: profile.reviewStatus === "MANUALLY_REJECTED" ? "Sent back" : "Reviewed",
      at   : fmt(profile.reviewedAt),
      by   : profile.reviewedBy?.name,
    },
    { icon: Clock,        label: "Last edited",      at: fmt(profile.updatedAt) },
  ].filter((row) => row.at)

  return (
    <div className="space-y-4">
      <div className="admin-card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">Review</h2>
          <div className="flex items-center gap-2">
            <span className={status.badge}>{status.label}</span>
            <span className={profile.isPublished ? "badge-success" : "badge-neutral"}>
              {profile.isPublished ? "Live" : "Not live"}
            </span>
          </div>
        </div>

        {status.note && <p className="text-sm text-muted-foreground">{status.note}</p>}

        <VendorProfileReviewActions
          profile={profile}
          canModerate={canModerate}
          suggestedReason={suggestedReason}
        />
      </div>

      {flags.length > 0 && (
        <div className="rounded-2xl border border-warning/30 bg-warning-bg px-5 py-4">
          <div className="flex items-center gap-2">
            <Flag className="h-4 w-4 shrink-0 text-warning" />
            <p className="text-sm font-semibold text-foreground">
              {flags.length === 1 ? "1 finding" : `${flags.length} findings`}
            </p>
          </div>
          <ul className="mt-2 space-y-1.5">
            {flags.map((line) => (
              <li key={line} className="flex gap-2 text-sm text-foreground">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-warning" />
                <span className="min-w-0 break-words">{line}</span>
              </li>
            ))}
          </ul>
          {profile.flaggedAt && (
            <p className="mt-2 text-xs text-muted-foreground">
              Detected {new Date(profile.flaggedAt).toLocaleDateString()}
            </p>
          )}
        </div>
      )}

      {profile.rejectionReason && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive-bg px-5 py-4">
          <div className="flex items-center gap-2">
            <Undo2 className="h-4 w-4 shrink-0 text-destructive" />
            <p className="text-sm font-semibold text-destructive">What the vendor was told</p>
          </div>
          <p className="mt-1 whitespace-pre-line text-sm text-foreground">{profile.rejectionReason}</p>
        </div>
      )}

      <div className="admin-card space-y-3">
        <h2 className="text-sm font-semibold text-foreground">History</h2>
        <ol className="space-y-3">
          {timeline.map(({ icon: Icon, label, at, by }) => (
            <li key={label} className="flex gap-3">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-card">
                <Icon className="h-3 w-3 text-muted-foreground" />
              </span>
              <div className="min-w-0">
                <p className="text-sm text-foreground">{label}</p>
                <p className="text-xs text-muted-foreground">
                  {at}
                  {by ? ` · ${by}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="admin-card space-y-2">
        <h2 className="text-sm font-semibold text-foreground">Vendor</h2>
        <p className="text-sm text-foreground">{profile.vendor.legalBusinessName}</p>
        <Link
          href={`/vendors/accounts/${profile.vendorAccountId}`}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
        >
          Open the vendor account
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    </div>
  )
}
