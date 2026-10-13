"use client"

import { useMemo, useState } from "react"
import { ChevronRight, Search, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { moduleLabel, permissionTitle } from "@/lib/identity/format"
import { moduleTone, type PermissionSummary } from "./PermissionBadge"

/** Every permission an account holds, grouped by module, in the same card style as the permission editor. */
export function AllPermissionsDialog({ name, permissions }: { name: string; permissions: PermissionSummary[] }) {
  const [query, setQuery] = useState("")
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const byModule = new Map<string, PermissionSummary[]>()
    for (const p of permissions) {
      if (q && !`${p.key} ${p.module} ${p.description ?? ""} ${permissionTitle(p.key)}`.toLowerCase().includes(q)) continue
      byModule.set(p.module, [...(byModule.get(p.module) ?? []), p])
    }
    return [...byModule.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [permissions, query])

  return (
    <Dialog onOpenChange={(open) => { if (!open) setQuery("") }}>
      <DialogTrigger asChild>
        <Button size="sm" className="group shadow-sm hover:-translate-y-px hover:bg-primary/90 hover:shadow-md">
          See all {permissions.length} permissions
          <ChevronRight className="transition-transform duration-200 group-hover:translate-x-0.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[90dvh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Permissions — {name}</DialogTitle>
          <DialogDescription>{permissions.length} permissions granted, grouped by module.</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search permissions…" aria-label="Search permissions" className="pl-8" />
        </div>

        <div className="max-h-[60dvh] min-h-0 space-y-4 overflow-y-auto pr-1">
          {groups.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No permissions match your search.</p>}
          {groups.map(([module, perms]) => (
            <section key={module} aria-label={moduleLabel(module)} className="space-y-1.5">
              <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <span aria-hidden className={cn("h-2 w-2 rounded-full", moduleTone(module).dot)} />
                {moduleLabel(module)} <span className="font-normal normal-case tracking-normal">({perms.length})</span>
              </h3>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {perms.map((p) => (
                  <li key={p.key} className="flex items-start gap-2.5 rounded-lg border border-border/70 px-3 py-2.5">
                    <ShieldCheck aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-foreground">{permissionTitle(p.key)}</span>
                      {p.description && <span className="block text-sm leading-snug text-muted-foreground">{p.description}</span>}
                      <span className="block break-all font-mono text-[11px] text-muted-foreground/80">{p.key}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="neutral">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
