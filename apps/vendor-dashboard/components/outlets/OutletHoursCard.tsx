"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Clock, Loader2, Pencil, Save, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet"
import { DAY_LABELS, type DayOfWeek, type OperatingHours } from "@/types/outlet"
import {
  buildWeek, summarizeHours, hasHoursSet, isClosedAllWeek, type DayEntry,
} from "@/lib/outlets/hours"

/*
 * Operating hours: a compact summary on the page, the seven-row editor in a
 * sheet. This is how Uber Eats, DoorDash and Google Business all handle it,
 * and for the same two reasons — a schedule is read far more often than it is
 * changed, and seven rows of day label + toggle + two time inputs cannot fit
 * a narrow dashboard column at any breakpoint. The old inline form tried, and
 * cut off.
 *
 * Hours are edit-only, never part of outlet creation: creation is about
 * identity and location, and the vendor has no outlet id to hang a schedule
 * on until it exists.
 */

interface Props {
  outletId: string
  existing: OperatingHours[]
}

export function OutletHoursCard({ outletId, existing }: Props) {
  const [open, setOpen] = useState(false)

  const isSet   = hasHoursSet(existing)
  const week    = buildWeek(existing)
  const summary = summarizeHours(week)

  return (
    <div className="dash-card flex h-full flex-col p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
          <Clock className="size-4 text-[var(--primary)]" />
          Opening hours
        </h2>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs"
          onClick={() => setOpen(true)}
        >
          <Pencil className="size-3" />
          {isSet ? "Edit" : "Set"}
        </Button>
      </div>

      {!isSet ? (
        <div className="mt-4 flex flex-1 flex-col items-start justify-center gap-2 rounded-xl border border-dashed border-[var(--border)] px-4 py-5">
          <p className="text-sm font-medium text-[var(--foreground)]">No hours set yet</p>
          <p className="text-xs leading-relaxed text-[var(--muted-foreground)]">
            Customers need to know when you&apos;re open before they can order from this outlet.
          </p>
          <Button size="sm" className="mt-1 h-7 gap-1.5 text-xs" onClick={() => setOpen(true)}>
            <Clock className="size-3" />Set hours
          </Button>
        </div>
      ) : (
        <>
          <dl className="mt-4 space-y-1.5">
            {summary.map((row) => (
              <div key={row.days} className="flex items-baseline justify-between gap-3 text-sm">
                <dt className="font-medium text-[var(--foreground)]">{row.days}</dt>
                <dd
                  className={
                    row.closed
                      ? "text-xs text-[var(--muted-foreground)]"
                      : "tabular-nums text-[var(--muted-foreground)]"
                  }
                >
                  {row.hours}
                </dd>
              </div>
            ))}
          </dl>

          {isClosedAllWeek(week) && (
            <p className="mt-4 flex items-start gap-1.5 text-xs text-[var(--warning)]">
              <TriangleAlert className="mt-px size-3 shrink-0" />
              Every day is marked closed, so this outlet can&apos;t take orders.
            </p>
          )}
        </>
      )}

      <HoursEditorSheet
        open={open}
        onOpenChange={setOpen}
        outletId={outletId}
        initial={week}
      />
    </div>
  )
}

// ─── editor ───────────────────────────────────────────────────────────────────

const WEEKDAYS: DayOfWeek[] = ["TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"]

function HoursEditorSheet({
  open, onOpenChange, outletId, initial,
}: {
  open        : boolean
  onOpenChange: (v: boolean) => void
  outletId    : string
  initial     : DayEntry[]
}) {
  const router = useRouter()
  const [hours, setHours]     = useState<DayEntry[]>(initial)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)

  /*
   * The sheet stays mounted so it can animate closed, which means its state
   * outlives a close. Without this, cancelling kept the abandoned edits and
   * showed them again the next time the vendor opened it — "Cancel" has to
   * actually discard. Resyncing on open also picks up whatever the last save
   * wrote, since the page refreshes underneath.
   */
  useEffect(() => {
    if (open) { setHours(initial); setError(null) }
    // `initial` is rebuilt every render, so keying on `open` is what makes this
    // fire once per opening rather than on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function updateDay(day: DayOfWeek, patch: Partial<DayEntry>) {
    setHours((prev) => prev.map((h) => (h.dayOfWeek === day ? { ...h, ...patch } : h)))
    setError(null)
  }

  /** Copy Monday onto a set of days — the one bulk action a weekly schedule
   *  actually needs, and the one every merchant tool offers. */
  function copyMondayTo(days: DayOfWeek[]) {
    const monday = hours.find((h) => h.dayOfWeek === "MONDAY")
    if (!monday) return
    setHours((prev) =>
      prev.map((h) =>
        days.includes(h.dayOfWeek)
          ? { ...h, openTime: monday.openTime, closeTime: monday.closeTime, isClosed: monday.isClosed }
          : h,
      ),
    )
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/outlets/${outletId}/operating-hours`, {
        method : "PUT",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ hours }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.message ?? "Couldn't save your hours"); return }
      onOpenChange(false)
      router.refresh()
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-[var(--border)] px-5 py-4">
          <SheetTitle className="text-base">Opening hours</SheetTitle>
          <SheetDescription className="text-xs">
            When customers can order from this outlet. You can change these any time.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-wrap gap-2 border-b border-[var(--border)] px-5 py-3">
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => copyMondayTo(WEEKDAYS)}>
            Copy Mon to weekdays
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => copyMondayTo(["TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"])}
          >
            Copy Mon to all
          </Button>
        </div>

        {/* The only scrolling region — the header, bulk actions and footer stay put. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-2">
            {hours.map((entry) => (
              <DayRow key={entry.dayOfWeek} entry={entry} onChange={updateDay} />
            ))}
          </div>
        </div>

        <SheetFooter className="gap-2 border-t border-[var(--border)] px-5 py-4">
          {error && <p className="text-xs text-[var(--destructive)]">{error}</p>}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button className="flex-1 gap-2" onClick={save} disabled={saving}>
              {saving
                ? <><Loader2 className="size-4 animate-spin" />Saving…</>
                : <><Save className="size-4" />Save hours</>}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

/*
 * One day.
 *
 * Open/closed is a segmented control, not a switch. A bare switch rendered as
 * a pale pill against a pale row — the state was there but nothing invited a
 * click, and you had to read the label beside it to know which way it was set.
 * Two labelled segments say what both options are, show which one is active in
 * colour, and give a much bigger tap target on a phone.
 *
 * The row itself carries the state too: green tint and a lit dot when open,
 * flat and muted when closed, so a whole week reads at a glance while editing.
 */
function DayRow({
  entry, onChange,
}: {
  entry   : DayEntry
  onChange: (day: DayOfWeek, patch: Partial<DayEntry>) => void
}) {
  const closed = entry.isClosed

  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2.5 transition-colors",
        closed
          ? "border-transparent bg-[color-mix(in_oklch,var(--muted)_35%,transparent)]"
          : "border-emerald-500/25 bg-emerald-500/5",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-medium text-[var(--foreground)]">
          <span
            className={cn(
              "size-1.5 rounded-full transition-colors",
              closed ? "bg-[var(--muted-foreground)]/40" : "bg-emerald-500",
            )}
          />
          {DAY_LABELS[entry.dayOfWeek]}
        </span>

        <OpenClosedToggle
          day={DAY_LABELS[entry.dayOfWeek]}
          closed={closed}
          onChange={(next) => onChange(entry.dayOfWeek, { isClosed: next })}
        />
      </div>

      {!closed && (
        <div className="mt-2.5 flex items-center gap-2">
          <TimeInput
            label={`${DAY_LABELS[entry.dayOfWeek]} opening time`}
            value={entry.openTime}
            onChange={(v) => onChange(entry.dayOfWeek, { openTime: v })}
          />
          <span className="text-xs text-[var(--muted-foreground)]">to</span>
          <TimeInput
            label={`${DAY_LABELS[entry.dayOfWeek]} closing time`}
            value={entry.closeTime}
            onChange={(v) => onChange(entry.dayOfWeek, { closeTime: v })}
          />
        </div>
      )}
    </div>
  )
}

function OpenClosedToggle({
  day, closed, onChange,
}: {
  day     : string
  closed  : boolean
  onChange: (closed: boolean) => void
}) {
  return (
    <div
      role="group"
      aria-label={`${day} open or closed`}
      className="inline-flex shrink-0 rounded-full bg-[color-mix(in_oklch,var(--muted)_60%,transparent)] p-0.5"
    >
      <Segment active={!closed} tone="open" onClick={() => onChange(false)}>Open</Segment>
      <Segment active={closed} tone="closed" onClick={() => onChange(true)}>Closed</Segment>
    </div>
  )
}

function Segment({
  active, tone, onClick, children,
}: {
  active  : boolean
  tone    : "open" | "closed"
  onClick : () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded-full px-3 py-1 text-xs font-semibold transition-all",
        !active && "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
        active && tone === "open" && "bg-emerald-500 text-white shadow-sm",
        // Solid grey rather than a white card pill: "Closed" has to read as a
        // chosen state, not as the unstyled default. Deliberately not red —
        // a shut Sunday is normal, not an error.
        active && tone === "closed" && "bg-[var(--muted-foreground)] text-[var(--background)] shadow-sm",
      )}
    >
      {children}
    </button>
  )
}

function TimeInput({
  label, value, onChange,
}: {
  label   : string
  value   : string
  onChange: (v: string) => void
}) {
  return (
    <input
      type="time"
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      // min-w-0 is what lets these shrink inside a flex row instead of forcing
      // the container wider than the sheet on a small screen.
      className="min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-sm tabular-nums"
      style={{
        borderColor: "var(--border)",
        background : "var(--card)",
        color      : "var(--foreground)",
      }}
    />
  )
}
