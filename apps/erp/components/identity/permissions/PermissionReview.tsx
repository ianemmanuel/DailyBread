import { Minus, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { permissionTitle } from "@/lib/identity/format"

export interface ReviewItem {
  key        : string
  description: string | null
  /** A grant outside the role's pool: it gives no access and is dropped on save. */
  stale?     : boolean
}

function Section({ kind, items }: { kind: "add" | "remove"; items: ReviewItem[] }) {
  if (items.length === 0) return null
  const add = kind === "add"
  const Icon = add ? Plus : Minus
  return (
    <section aria-label={add ? "Permissions to add" : "Permissions to remove"} className="space-y-2">
      <h3 className={cn("flex items-center gap-1.5 text-sm font-semibold", add ? "text-emerald-700" : "text-red-700")}>
        <span className={cn("flex h-5 w-5 items-center justify-center rounded-full text-white", add ? "bg-emerald-600" : "bg-red-600")}>
          <Icon aria-hidden className="h-3 w-3" strokeWidth={3} />
        </span>
        {add ? "Adding" : "Removing"} {items.length} permission{items.length === 1 ? "" : "s"}
      </h3>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li
            key={item.key}
            className={cn("rounded-lg border border-l-4 bg-card px-3 py-2.5", add ? "border-l-emerald-600" : "border-l-red-600")}
          >
            <p className="text-sm font-medium text-foreground">{permissionTitle(item.key)}</p>
            {item.description && <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{item.description}</p>}
            {item.stale && <p className="mt-0.5 text-sm text-muted-foreground">No longer part of this role, so it gives no access today.</p>}
            <p className="mt-1 font-mono text-xs text-muted-foreground/80">{item.key}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** The changes a save would make, written out in full so they can be checked before confirming. */
export function PermissionReview({ added, removed, unchanged, className }: {
  added    : ReviewItem[]
  removed  : ReviewItem[]
  unchanged: number
  className?: string
}) {
  return (
    <div className={cn("min-h-0 space-y-5 overflow-y-auto pr-1", className)}>
      <Section kind="add" items={added} />
      <Section kind="remove" items={removed} />
      {unchanged > 0 && (
        <p className="text-sm text-muted-foreground">
          {unchanged} other permission{unchanged === 1 ? " stays" : "s stay"} as {unchanged === 1 ? "it is" : "they are"}.
        </p>
      )}
    </div>
  )
}
