"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, ClipboardCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"

type Policy = "NONE" | "MEAL_PLAN_ONLY" | "ALL"

const OPTIONS: { value: Policy; label: string; hint: string }[] = [
  { value: "NONE",           label: "Not required",        hint: "Outlets here never need a physical inspection." },
  { value: "MEAL_PLAN_ONLY", label: "Meal plans only",     hint: "Required before an outlet can offer meal plans (recommended)." },
  { value: "ALL",            label: "All operations",      hint: "Required before an outlet can operate at all." },
]

export function CountryInspectionPolicy({
  countrySlug, current, canWrite,
}: {
  countrySlug: string
  current: Policy
  canWrite: boolean
}) {
  const router = useRouter()
  const [value, setValue] = useState<Policy>(current)
  const [busy, setBusy] = useState(false)

  const dirty = value !== current
  const active = OPTIONS.find((o) => o.value === value)

  async function save() {
    setBusy(true)
    try {
      const res = await fetch(`/api/countries/${countrySlug}/inspection-policy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policy: value }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error("Couldn't update the policy", { description: data?.message }); return }
      toast.success("Inspection policy updated")
      router.refresh()
    } catch {
      toast.error("Network error")
    } finally { setBusy(false) }
  }

  return (
    <div className="admin-card space-y-3">
      <div className="flex items-center gap-2">
        <div className="icon-badge icon-badge-primary h-9 w-9"><ClipboardCheck className="h-4 w-4" /></div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">Outlet inspection policy</h2>
          <p className="text-xs text-muted-foreground">Whether outlets in this country need a physical premises inspection.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select value={value} onValueChange={(v) => setValue(v as Policy)} disabled={!canWrite || busy}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            {OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {canWrite && dirty && (
          <Button type="button" size="sm" className="rounded-full gap-1.5" disabled={busy} onClick={save}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save
          </Button>
        )}
      </div>

      {active && <p className="text-xs text-muted-foreground">{active.hint}</p>}
    </div>
  )
}
