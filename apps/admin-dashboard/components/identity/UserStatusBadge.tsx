interface Props {
  status: string
}

const labelMap: Record<string, string> = {
  pending    : "Pending",
  invited    : "Invited",
  active     : "Active",
  suspended  : "Suspended",
  deactivated: "Deactivated",
}

/**
 * UserStatusBadge — maps AdminUserStatus to the correct CSS badge class.
 * Classes are defined in globals.css (.status-*) so they work in both
 * light and dark themes automatically.
 * Server component — no client JS needed.
 */
export function UserStatusBadge({ status }: Props) {
  return (
    <span className={`status-${status}`} aria-label={`Status: ${labelMap[status] ?? status}`}>
      {labelMap[status] ?? status}
    </span>
  )
}