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

export function UserStatusBadge({ status }: Props) {
  return (
    <span className={`status-${status}`} aria-label={`Status: ${labelMap[status] ?? status}`}>
      {labelMap[status] ?? status}
    </span>
  )
}