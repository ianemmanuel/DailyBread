
export function VendorApplicationStatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string; dot: string }> = {
    DRAFT          : { cls: "badge-neutral", label: "Draft",          dot: "bg-muted-foreground" },
    SUBMITTED      : { cls: "badge-info",    label: "Submitted",      dot: "bg-info" },
    UNDER_REVIEW   : { cls: "badge-warning", label: "Under Review",   dot: "bg-warning" },
    NEEDS_REVISION : { cls: "badge-warning", label: "Needs Revision", dot: "bg-warning" },
    APPROVED       : { cls: "badge-success", label: "Approved",       dot: "bg-success" },
    REJECTED       : { cls: "badge-danger",  label: "Rejected",       dot: "bg-destructive" },
  }
  const { cls, label, dot } = map[status] ?? { cls: "badge-neutral", label: status, dot: "bg-muted-foreground" }
  return (
    <span className={cls}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
      {label}
    </span>
  )
}
