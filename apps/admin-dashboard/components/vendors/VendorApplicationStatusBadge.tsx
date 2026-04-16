
export function VendorApplicationStatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    DRAFT        : { cls: "badge-neutral", label: "Draft" },
    SUBMITTED    : { cls: "badge-info",    label: "Submitted" },
    UNDER_REVIEW : { cls: "badge-warning", label: "Under Review" },
    APPROVED     : { cls: "badge-success", label: "Approved" },
    REJECTED     : { cls: "badge-danger",  label: "Rejected" },
  }
  const { cls, label } = map[status] ?? { cls: "badge-neutral", label: status }
  return <span className={cls}>{label}</span>
}