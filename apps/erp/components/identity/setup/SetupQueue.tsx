import Link from "next/link"
import { AlertCircle, ArrowRight, ClipboardCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/EmptyState"
import { TablePagination } from "@/components/shared/TablePagination"
import { UserStatusBadge } from "@/components/identity/UserStatusBadge"
import { detailHref, formatDate } from "@/lib/identity/format"
import { cn } from "@/lib/utils"
import type { ListPendingSetupsResult, PendingSetup, SetupLane } from "@/types"
import { LANE_COPY, LANES } from "./setup-lanes"

interface Props {
  /** null when the queue could not be loaded. */
  result: ListPendingSetupsResult | null
  lane  : SetupLane | "all"
}

const LANE_CHIP: Record<SetupLane, string> = {
  department: "bg-primary/10 text-primary ring-primary/20",
  recovery  : "bg-amber-50 text-amber-800 ring-amber-600/20",
  oversight : "bg-muted text-muted-foreground ring-border",
}

export function SetupLaneTabs({ result, lane }: Props) {
  const tabs: Array<{ value: SetupLane | "all"; label: string; count: number }> = [
    { value: "all", label: "All", count: result?.counts.total ?? 0 },
    ...LANES.filter((l) => l === lane || (result?.counts[l] ?? 0) > 0)
      .map((l) => ({ value: l, label: LANE_COPY[l].tab, count: result?.counts[l] ?? 0 })),
  ]
  return (
    <nav aria-label="Queue" className="flex flex-wrap gap-1.5">
      {tabs.map((t) => (
        <Link
          key={t.value}
          href={t.value === "all" ? "/identity/setup" : `/identity/setup?lane=${t.value}`}
          aria-current={lane === t.value ? "page" : undefined}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            lane === t.value ? "border-primary/30 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          {t.label}
          <span className="tabular-nums opacity-70">{t.count}</span>
        </Link>
      ))}
    </nav>
  )
}

function SetupRow({ setup }: { setup: PendingSetup }) {
  const { target } = setup
  const place = [target.scopeLabel, target.scope?.tier === "CITY" ? target.countryName : null].filter(Boolean).join(", ")
  return (
    <li className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium text-foreground">{target.firstName} {target.lastName}</p>
          {setup.attention && (
            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
              <AlertCircle aria-hidden className="h-3 w-3" />
              Needs you
            </span>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">{target.email}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
          <UserStatusBadge status={target.status} />
          {target.role && <span className="badge-neutral">{target.role.displayName}</span>}
          {place && <span className="badge-info">{place}</span>}
          <span className={cn("rounded-full px-2 py-0.5 font-medium ring-1 ring-inset", LANE_CHIP[setup.lane])}>{LANE_COPY[setup.lane].chip}</span>
          <span className="text-muted-foreground">Invited {formatDate(setup.openedAt)}</span>
        </div>
      </div>
      <Button asChild size="sm" variant={setup.lane === "recovery" ? "warning" : "default"} className="group shrink-0">
        <Link href={detailHref(target.id)}>
          Set up permissions
          <ArrowRight className="transition-transform duration-200 group-hover:translate-x-0.5" />
        </Link>
      </Button>
    </li>
  )
}

/** The pending permission-setup queue. Rows, lanes and flags are the backend's answer for this viewer. */
export function SetupQueue({ result, lane }: Props) {
  if (!result) {
    return (
      <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        The pending setups could not be loaded. Reload the page to try again.
      </div>
    )
  }
  if (result.setups.length === 0) {
    const elsewhere = lane !== "all" && result.counts.total > 0
    return (
      <EmptyState
        icon={ClipboardCheck}
        title={elsewhere ? "Nothing in this lane" : "No one is waiting for permissions"}
        description={elsewhere
          ? "Other lanes still have pending setups."
          : "When a new administrator you can set up is invited, they appear here until their first permissions are granted."}
      />
    )
  }
  return (
    <div className="admin-card overflow-hidden p-0">
      {lane !== "all" && <p className="border-b border-border/60 px-4 py-2.5 text-xs text-muted-foreground">{LANE_COPY[lane].blurb}</p>}
      <ul className="divide-y divide-border/60">
        {result.setups.map((s) => <SetupRow key={s.target.id} setup={s} />)}
      </ul>
      <TablePagination
        total={result.total}
        page={result.page}
        totalPages={result.totalPages}
        basePath="/identity/setup"
        params={lane === "all" ? {} : { lane }}
        itemLabel="pending setups"
      />
    </div>
  )
}
