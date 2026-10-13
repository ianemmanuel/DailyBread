import type { ReactNode } from "react"
import { adminName, formatDate, scopeLabel } from "@/lib/identity/format"
import type { AdminUserDetail } from "@/types"

interface Props {
  user: AdminUserDetail
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-2.5 sm:flex-row sm:items-baseline sm:gap-4">
      <dt className="shrink-0 text-xs text-muted-foreground sm:w-36">{label}</dt>
      <dd className="flex min-w-0 flex-wrap items-center gap-x-2 text-sm text-foreground">{children}</dd>
    </div>
  )
}

const muted = (text: string) => <span className="text-muted-foreground">{text}</span>

/*
 * "Created by" and "Invited by" are different facts with different sources:
 * the record's creator, and whoever sent the latest invitation. An account
 * that was never invited has no inviter, and an invitation whose sender was
 * not recorded says so rather than borrowing the creator's name.
 */
function invitation(user: AdminUserDetail): { sent: ReactNode; by: ReactNode | null } {
  if (!user.invitationSentAt) {
    return { sent: muted(user.status === "pending" ? "Not yet invited" : "No invitation on record"), by: null }
  }
  const sent = formatDate(user.invitationSentAt)
  const count = user.invitationSentCount > 1 ? ` · ${user.invitationSentCount} sent` : ""
  const expiry = user.status === "invited" && user.invitationExpiresAt ? ` · expires ${formatDate(user.invitationExpiresAt)}` : ""
  return {
    sent: <>{`Sent ${sent}${count}`}{expiry && <span className="text-muted-foreground">{expiry}</span>}</>,
    by  : user.invitationSentBy ? adminName(user.invitationSentBy) : muted("Not recorded"),
  }
}

export function AccountDetails({ user }: Props) {
  const invite = invitation(user)

  return (
    <section aria-labelledby="account-details" className="overflow-hidden rounded-xl border border-border bg-card">
      <h2 id="account-details" className="border-b border-border px-4 py-2.5 text-sm font-semibold text-foreground">Account</h2>
      <dl className="-mb-px grid divide-y divide-border/60 md:grid-cols-2 md:divide-y-0 md:[&>div]:border-b md:[&>div]:border-border/60">
        <Row label="Role">{user.role?.displayName ?? muted("No role")}</Row>
        <Row label="Scope">{scopeLabel(user.scopes)}</Row>
        <Row label="Employee ID">{user.employeeId ? <span className="font-mono text-xs">{user.employeeId}</span> : muted("—")}</Row>
        <Row label="Last active">{formatDate(user.lastSeenAt) ?? muted("Never")}</Row>
        <Row label="Created">{formatDate(user.createdAt)}</Row>
        <Row label="Created by">{user.createdBy ? adminName(user.createdBy) : muted("Not recorded")}</Row>
        <Row label="Invitation">{invite.sent}</Row>
        {invite.by && <Row label="Invited by">{invite.by}</Row>}
        {user.status === "suspended" && user.deactivationReason && (
          <Row label="Suspension reason">{user.deactivationReason}</Row>
        )}
        {user.status === "deactivated" && (
          <>
            <Row label="Deactivated">{formatDate(user.deactivatedAt) ?? muted("—")}</Row>
            {user.deactivationReason && <Row label="Reason">{user.deactivationReason}</Row>}
          </>
        )}
      </dl>
    </section>
  )
}
