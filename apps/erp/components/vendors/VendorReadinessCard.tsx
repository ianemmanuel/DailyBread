import { CheckCircle2, CircleSlash } from "lucide-react"
import type { VendorGoLiveStatus, VendorGoLiveBlocker } from "@/types"

/*
 * Admin-facing render of the backend's getVendorGoLiveStatus (attached to the
 * vendor account detail response). Factual, not instructional — an admin wants
 * to know at a glance whether a vendor is selling-ready and, if not, which of
 * the three independent requirements is outstanding. The backend is
 * authoritative; this only renders what it returned.
 */

const BLOCKER_LABEL: Record<VendorGoLiveBlocker, string> = {
  VERIFIED_PAYOUT_ACCOUNT: "No verified payout account",
  PROFILE                : "No public profile created",
  PROFILE_UNDER_REVIEW   : "Public profile is flagged / rejected in review",
  OUTLET                 : "No qualifying active outlet",
}

export function VendorReadinessCard({ status }: { status: VendorGoLiveStatus }) {
  const requirements: { label: string; met: boolean }[] = [
    { label: "Verified payout account", met: status.hasVerifiedPayoutAccount },
    { label: "Complete public profile", met: status.hasProfile && status.isProfileReviewClear },
    { label: "Qualifying active outlet", met: status.hasActiveOutlet },
  ]

  return (
    <div className="admin-card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Selling readiness</h2>
        {status.isPublished
          ? <span className="badge-success inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Live</span>
          : status.canGoLive
            ? <span className="badge-warning">Selling ready — not published</span>
            : <span className="badge-danger inline-flex items-center gap-1"><CircleSlash className="h-3 w-3" /> Not selling ready</span>}
      </div>

      <ul className="space-y-1.5 text-xs">
        {requirements.map((r) => (
          <li key={r.label} className="flex items-center gap-2">
            {r.met
              ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
              : <CircleSlash className="h-3.5 w-3.5 shrink-0 text-warning" />}
            <span className={r.met ? "text-foreground" : "text-muted-foreground"}>{r.label}</span>
            <span className="ml-auto shrink-0 text-muted-foreground">{r.met ? "Met" : "Outstanding"}</span>
          </li>
        ))}
      </ul>

      {status.blockers.length > 0 && (
        <ul className="space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
          {status.blockers.map((b) => (
            <li key={b}>{BLOCKER_LABEL[b]}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
