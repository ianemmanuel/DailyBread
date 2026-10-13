import type { AdminStatusCounts } from "@/types"

const CELLS: Array<{ key: keyof AdminStatusCounts; label: string; dot?: string }> = [
  { key: "total",       label: "Total" },
  { key: "active",      label: "Active",              dot: "bg-success" },
  { key: "pending",     label: "Pending invitation",  dot: "bg-info" },
  { key: "invited",     label: "Awaiting acceptance", dot: "bg-warning" },
  { key: "suspended",   label: "Suspended",           dot: "bg-warning" },
  { key: "deactivated", label: "Deactivated",         dot: "bg-muted-foreground/60" },
]

/** Read-only counts of every administrator in the viewer's scope; the list's filters do not change them. */
export function DirectorySummary({ counts }: { counts: AdminStatusCounts }) {
  return (
    <section aria-label="Administrators in your scope" className="rounded-xl border border-border bg-card">
      <dl className="grid grid-cols-3 divide-border sm:grid-cols-6 sm:divide-x [&>div:nth-child(-n+3)]:border-b sm:[&>div:nth-child(-n+3)]:border-b-0">
        {CELLS.map(({ key, label, dot }) => (
          <div key={key} className="flex flex-col gap-0.5 px-4 py-2.5">
            <dt className="flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
              {dot && <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />}
              {label}
            </dt>
            <dd className="text-lg font-semibold tabular-nums text-foreground">{counts[key]}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
