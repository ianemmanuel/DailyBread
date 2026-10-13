import type { DocumentTypeStatus } from "@/types/document-type.types"

export function DocumentTypeStatusBadge({ status }: { status: DocumentTypeStatus | string }) {
  const map: Record<string, { cls: string; label: string; dot: string }> = {
    ACTIVE    : { cls: "badge-success", label: "Active",     dot: "bg-success" },
    INACTIVE  : { cls: "badge-neutral", label: "Inactive",   dot: "bg-muted-foreground" },
    DEPRECATED: { cls: "badge-warning", label: "Deprecated", dot: "bg-warning" },
    ARCHIVED  : { cls: "badge-neutral", label: "Archived",   dot: "bg-muted-foreground" },
  }
  const { cls, label, dot } = map[status] ?? { cls: "badge-neutral", label: status, dot: "bg-muted-foreground" }
  return (
    <span className={cls}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
      {label}
    </span>
  )
}
