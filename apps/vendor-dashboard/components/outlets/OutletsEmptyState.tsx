import Link from "next/link"
import { Plus, Store, SearchX } from "lucide-react"
import { Button } from "@/components/ui/button"

/*
 * Two genuinely different empty states behind one component: a vendor with no
 * outlets at all needs a call to action, a vendor whose filters matched
 * nothing needs to know their filters are why.
 */
export function OutletsEmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-20 text-center"
      style={{ borderColor: "var(--border)" }}
    >
      <div
        className="mb-4 flex size-16 items-center justify-center rounded-2xl"
        style={{ background: "color-mix(in oklch, var(--primary) 10%, transparent)" }}
      >
        {filtered
          ? <SearchX className="size-8 text-[var(--primary)]" />
          : <Store className="size-8 text-[var(--primary)]" />}
      </div>
      <h3 className="mb-1 text-lg font-semibold text-[var(--foreground)]">
        {filtered ? "No outlets match those filters" : "No outlets yet"}
      </h3>
      <p className="mb-6 max-w-xs text-sm text-[var(--muted-foreground)]">
        {filtered
          ? "Try a different search term, status or city."
          : "Add your first kitchen location to start receiving orders."}
      </p>
      {!filtered && (
        <Button
          asChild
          className="gap-2 rounded-xl"
          style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
        >
          <Link href="/outlets/create"><Plus className="size-4" />Create your first outlet</Link>
        </Button>
      )}
    </div>
  )
}
