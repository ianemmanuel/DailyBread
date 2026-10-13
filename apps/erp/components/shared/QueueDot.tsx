/**
 * Small "this needs a look" indicator for a queue pill — used on the
 * Unassigned/Escalated tabs of /vendors/applications and the
 * Unclaimed/Escalated tabs of /vendors/compliance. Deliberately just a
 * dot, not a live count badge — same "subtle glow, not a live counter"
 * convention as the sidebar's compliance nav dot (see
 * admin.session.controller.ts's hasOpenComplianceIssues).
 */
export function QueueDot({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <span className="relative ml-1 inline-flex h-1.5 w-1.5">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-destructive" />
    </span>
  )
}
