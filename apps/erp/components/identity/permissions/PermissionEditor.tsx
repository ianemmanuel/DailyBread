"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { KeyRound, LifeBuoy, Loader2, Lock, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { AssignmentMode, PermissionOptions } from "@/types"

/*
 * Edits one administrator's grants under ONE of two authorities, kept visibly
 * apart: ordinary delegation (only keys you hold) and recovery (any key of the
 * target role's pool, for a department's first or replacement lead). Which
 * keys may move is the server's answer (permission-options, computed by the
 * rules the save runs); everything else is locked. The save goes to the
 * route for the chosen mode and the backend re-checks it — its refusal is
 * shown as-is.
 */

const MODE_COPY: Record<AssignmentMode, { title: string; blurb: string }> = {
  delegation: {
    title: "Delegation",
    blurb: "You can grant or remove only permissions you hold yourself.",
  },
  recovery: {
    title: "Recovery",
    blurb: "Set up or restore a department's lead: any permission in this role's pool, including ones you do not hold. Recorded as a recovery.",
  },
}

interface Props {
  options  : PermissionOptions
  /** Called after the backend accepted the change. */
  onSaved? : () => void
  onCancel?: () => void
  /** Constrains the list's height so header and footer stay visible inside a dialog. */
  scrollClassName?: string
}

export function PermissionEditor({ options, onSaved, onCancel, scrollClassName }: Props) {
  const router = useRouter()
  const { target, pool, grants, staleGrants } = options

  const modes = (["delegation", "recovery"] as const).filter((m) => options[m].allowed)
  const [mode, setMode]         = useState<AssignmentMode | null>(modes[0] ?? null)
  const poolKeys                = useMemo(() => new Set(pool.map((p) => p.key)), [pool])
  const initial                 = useMemo(() => grants.filter((k) => poolKeys.has(k)), [grants, poolKeys])
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initial))
  const [query, setQuery]       = useState("")
  const [confirming, setConfirming] = useState(false)
  const [pending, setPending]   = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const movable = useMemo(() => new Set(mode ? options[mode].movable : []), [mode, options])
  const added   = [...selected].filter((k) => !initial.includes(k))
  const removed = initial.filter((k) => !selected.has(k))
  const changed = added.length > 0 || removed.length > 0 || staleGrants.length > 0

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const byModule = new Map<string, PermissionOptions["pool"]>()
    for (const p of pool) {
      if (q && !`${p.key} ${p.module} ${p.description ?? ""}`.toLowerCase().includes(q)) continue
      byModule.set(p.module, [...(byModule.get(p.module) ?? []), p])
    }
    return [...byModule.entries()]
  }, [pool, query])

  if (!mode) {
    const reason = options.delegation.message ?? options.recovery.message
    return <p className="text-sm text-muted-foreground">You cannot change this administrator&apos;s permissions{reason ? `: ${reason}` : "."}</p>
  }

  const recovery = mode === "recovery"

  function switchMode(next: AssignmentMode) {
    setMode(next); setSelected(new Set(initial)); setConfirming(false); setError(null)
  }
  function toggle(key: string, on: boolean) {
    setSelected((cur) => { const next = new Set(cur); if (on) next.add(key); else next.delete(key); return next })
  }
  function cancel() {
    setSelected(new Set(initial)); setConfirming(false); setError(null)
    onCancel?.()
  }

  async function save() {
    setPending(true); setError(null)
    try {
      const res = await fetch(`/api/identity/users/${encodeURIComponent(target.id)}/permissions${recovery ? "/recovery" : ""}`, {
        method : "PUT",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ permissionKeys: [...selected] }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.message ?? "The permissions were not saved.")
        setConfirming(false)
        return
      }
      toast.success(recovery ? "Permissions recovered" : "Permissions saved")
      setConfirming(false)
      router.refresh()
      onSaved?.()
    } catch {
      setError("Network error — the permissions were not saved.")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-col gap-3">
      {modes.length > 1 && (
        <div role="tablist" aria-label="Authority" className="inline-flex w-fit rounded-lg border border-border p-0.5">
          {modes.map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              disabled={pending}
              onClick={() => switchMode(m)}
              className={cn(
                "inline-flex cursor-pointer items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                mode === m ? (m === "recovery" ? "bg-warning/15 text-warning" : "bg-primary/10 text-primary") : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m === "recovery" ? <LifeBuoy className="h-3.5 w-3.5" /> : <KeyRound className="h-3.5 w-3.5" />}
              {MODE_COPY[m].title}
            </button>
          ))}
        </div>
      )}

      <p className={cn("rounded-lg border px-3 py-2 text-xs", recovery ? "border-warning/40 bg-warning/5 text-foreground" : "border-border/70 bg-muted/30 text-muted-foreground")}>
        <span className="font-medium text-foreground">{MODE_COPY[mode].title}.</span> {MODE_COPY[mode].blurb}
      </p>

      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search permissions…"
          aria-label="Search permissions"
          className="pl-8"
        />
      </div>

      <div className={cn("min-h-0 space-y-4 overflow-y-auto pr-1", scrollClassName)}>
        {groups.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {pool.length === 0 ? "This role has no permissions to assign." : "No permissions match your search."}
          </p>
        )}
        {groups.map(([module, perms]) => (
          <fieldset key={module} className="space-y-1.5">
            <legend className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{module.replace(/_/g, " ")}</legend>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {perms.map((p) => {
                const locked  = !movable.has(p.key)
                const checked = selected.has(p.key)
                return (
                  <label
                    key={p.key}
                    title={locked ? "You cannot change this permission under this authority" : undefined}
                    className={cn(
                      "flex items-start gap-2.5 rounded-lg border px-3 py-2",
                      locked ? "cursor-not-allowed border-border/40 opacity-60" : "cursor-pointer border-border/70 hover:bg-muted/40",
                      checked && "border-primary/30 bg-primary/5",
                    )}
                  >
                    <Checkbox className="mt-0.5" checked={checked} disabled={locked || pending} onCheckedChange={(v) => toggle(p.key, v === true)} />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1 break-all font-mono text-xs text-foreground">
                        {p.key.split(":").slice(1).join(":")}
                        {locked && <Lock aria-label="Locked" className="h-3 w-3 shrink-0 text-muted-foreground" />}
                      </span>
                      {p.description && <span className="block text-xs text-muted-foreground">{p.description}</span>}
                    </span>
                  </label>
                )
              })}
            </div>
          </fieldset>
        ))}
      </div>

      {staleGrants.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {staleGrants.length} old grant{staleGrants.length === 1 ? "" : "s"} outside the {target.role?.displayName ?? "role"} pool give no access and will be removed on save.
        </p>
      )}

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      {confirming ? (
        <div className="space-y-2 rounded-lg border border-warning/40 bg-warning/5 p-3">
          <p className="text-sm font-medium text-foreground">Apply recovery to {target.firstName} {target.lastName}?</p>
          {added.length > 0 && <p className="text-xs"><span className="font-medium">Add ({added.length}):</span> <span className="break-all font-mono text-muted-foreground">{added.join(", ")}</span></p>}
          {removed.length > 0 && <p className="text-xs"><span className="font-medium">Remove ({removed.length}):</span> <span className="break-all font-mono text-muted-foreground">{removed.join(", ")}</span></p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" disabled={pending} onClick={() => setConfirming(false)}>Back</Button>
            <Button type="button" variant="warning" disabled={pending} onClick={save}>
              {pending && <Loader2 className="animate-spin" />}
              Apply recovery
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {changed ? `${added.length} to add · ${removed.length + staleGrants.length} to remove` : `${selected.size} of ${pool.length} granted`}
          </span>
          <div className="flex gap-2">
            {(onCancel || changed) && (
              <Button type="button" variant="outline" disabled={pending} onClick={cancel}>Cancel</Button>
            )}
            <Button
              type="button"
              variant={recovery ? "warning" : "default"}
              disabled={pending || !changed}
              onClick={() => (recovery ? setConfirming(true) : save())}
            >
              {pending && <Loader2 className="animate-spin" />}
              {recovery ? "Review recovery…" : "Save permissions"}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
