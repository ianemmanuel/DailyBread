interface Props {
  availability     : string
  unavailableUntil?: string | Date | null
}

/**
 * AvailabilityBadge — review-workload availability, independent of account
 * status (UserStatusBadge). An ACTIVE admin can still be UNAVAILABLE (on
 * leave, heads-down, etc.) without being suspended/deactivated.
 */
export function AvailabilityBadge({ availability, unavailableUntil }: Props) {
  if (availability !== "UNAVAILABLE") {
    return <span className="badge-success">Available</span>
  }
  const until = unavailableUntil ? new Date(unavailableUntil) : null
  return (
    <span className="badge-warning" aria-label="Unavailable">
      Unavailable{until ? ` until ${until.toLocaleDateString()}` : ""}
    </span>
  )
}
