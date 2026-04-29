"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@repo/ui/components/button"
import { Switch } from "@repo/ui/components/switch"
import { Label } from "@repo/ui/components/label"
import { Loader2, Clock, Save } from "lucide-react"
import { DAYS_OF_WEEK, DAY_LABELS, type DayOfWeek, type OperatingHours } from "@/types/outlet"

interface Props {
  outletId: string
  existing: OperatingHours[]
}

interface DayEntry {
  dayOfWeek: DayOfWeek
  openTime : string
  closeTime: string
  isClosed : boolean
}

function buildInitial(existing: OperatingHours[]): DayEntry[] {
  return DAYS_OF_WEEK.map(day => {
    const found = existing.find(e => e.dayOfWeek === day)
    return {
      dayOfWeek: day,
      openTime : found?.openTime  ?? "08:00",
      closeTime: found?.closeTime ?? "22:00",
      isClosed : found?.isClosed  ?? false,
    }
  })
}

export function OperatingHoursForm({ outletId, existing }: Props) {
  const router = useRouter()
  const [hours, setHours]     = useState<DayEntry[]>(buildInitial(existing))
  const [loading, setLoading] = useState(false)
  const [saved, setSaved]     = useState(false)
  const [error, setError]     = useState<string | null>(null)

  function updateDay(day: DayOfWeek, field: keyof DayEntry, value: string | boolean) {
    setHours(prev => prev.map(h => h.dayOfWeek === day ? { ...h, [field]: value } : h))
    setSaved(false)
  }

  // Copy Monday's hours to all weekdays
  function applyMondayToWeekdays() {
    const monday = hours.find(h => h.dayOfWeek === "MONDAY")
    if (!monday) return
    setHours(prev => prev.map(h =>
      ["TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"].includes(h.dayOfWeek)
        ? { ...h, openTime: monday.openTime, closeTime: monday.closeTime, isClosed: monday.isClosed }
        : h
    ))
  }

  async function handleSave() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/vendor/outlets/${outletId}/operating-hours`, {
        method : "PUT",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ hours }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.message ?? "Failed to save hours"); return }
      setSaved(true)
      router.refresh()
    } catch {
      setError("Something went wrong.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="size-4 text-[var(--primary)]" />
          <h3 className="font-semibold text-[var(--foreground)]">Operating Hours</h3>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          onClick={applyMondayToWeekdays}
        >
          Copy Mon → Weekdays
        </Button>
      </div>

      <div className="space-y-2">
        {hours.map(entry => (
          <div
            key={entry.dayOfWeek}
            className="flex items-center gap-4 rounded-xl px-4 py-3 transition-colors"
            style={{ background: "color-mix(in oklch, var(--muted) 30%, transparent)" }}
          >
            {/* Day label */}
            <span className="w-10 shrink-0 text-sm font-medium text-[var(--foreground)]">
              {DAY_LABELS[entry.dayOfWeek]}
            </span>

            {/* Open/Close toggle */}
            <div className="flex items-center gap-2">
              <Switch
                id={`closed-${entry.dayOfWeek}`}
                checked={!entry.isClosed}
                onCheckedChange={v => updateDay(entry.dayOfWeek, "isClosed", !v)}
              />
              <Label htmlFor={`closed-${entry.dayOfWeek}`} className="text-xs text-[var(--muted-foreground)] cursor-pointer">
                {entry.isClosed ? "Closed" : "Open"}
              </Label>
            </div>

            {/* Time inputs */}
            {!entry.isClosed && (
              <div className="flex items-center gap-2 ml-auto">
                <input
                  type="time"
                  value={entry.openTime}
                  onChange={e => updateDay(entry.dayOfWeek, "openTime", e.target.value)}
                  className="rounded-lg border px-2 py-1 text-sm"
                  style={{
                    borderColor     : "var(--border)",
                    background      : "var(--card)",
                    color           : "var(--foreground)",
                    colorScheme     : "normal",
                  }}
                />
                <span className="text-xs text-[var(--muted-foreground)]">to</span>
                <input
                  type="time"
                  value={entry.closeTime}
                  onChange={e => updateDay(entry.dayOfWeek, "closeTime", e.target.value)}
                  className="rounded-lg border px-2 py-1 text-sm"
                  style={{
                    borderColor     : "var(--border)",
                    background      : "var(--card)",
                    color           : "var(--foreground)",
                    colorScheme     : "normal",
                  }}
                />
              </div>
            )}
            {entry.isClosed && (
              <span className="ml-auto text-xs text-[var(--muted-foreground)]">Not accepting orders</span>
            )}
          </div>
        ))}
      </div>

      {error && (
        <p className="text-sm text-[var(--destructive)]">{error}</p>
      )}

      <Button
        onClick={handleSave}
        disabled={loading}
        className="w-full gap-2"
        style={{ background: saved ? "var(--success)" : "var(--primary)", color: "var(--primary-foreground)" }}
      >
        {loading ? (
          <><Loader2 className="size-4 animate-spin" />Saving…</>
        ) : saved ? (
          "✓ Saved"
        ) : (
          <><Save className="size-4" />Save Hours</>
        )}
      </Button>
    </div>
  )
}