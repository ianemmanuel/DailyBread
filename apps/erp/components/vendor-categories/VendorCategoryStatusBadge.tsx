import type { VendorTypeStatus } from "@/types/vendor-type.types"

export function VendorCategoryStatusBadge({ status }: { status: VendorTypeStatus | string }) {
  const map: Record<string, { cls: string; label: string; dot: string }> = {
    ACTIVE   : { cls: "badge-success", label: "Active",    dot: "bg-success" },
    SUSPENDED: { cls: "badge-warning", label: "Suspended", dot: "bg-warning" },
  }
  const { cls, label, dot } = map[status] ?? { cls: "badge-neutral", label: status, dot: "bg-muted-foreground" }
  return (
    <span className={cls}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
      {label}
    </span>
  )
}
