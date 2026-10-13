"use client"

import { useState } from "react"
import { ArrowRight, Loader2, RotateCcw, ShieldAlert, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { RoleCombobox } from "@/components/identity/RoleCombobox"
import { ScopeSelector } from "@/components/identity/ScopeSelector"
import type { AdminRole, ScopeEntry } from "@/types"
import { useSaveRequest } from "./useSaveRequest"
import { SaveError } from "./SaveError"

interface Props {
  userId        : string
  /** Roles the server says are assignable. */
  roles         : AdminRole[]
  currentRoleId : string | null
  currentScope  : ScopeEntry | null
  /** Display labels for the confirmation. */
  currentLabels : { role: string; scope: string }
  grantCount    : number
  isGlobalActor : boolean
  actorCountries: string[]
  updatedAt     : string
}

const sameScope = (a: ScopeEntry | null | undefined, b: ScopeEntry | null | undefined) =>
  !!a && !!b && a.scopeType === b.scopeType && (a.countryId ?? null) === (b.countryId ?? null) && (a.cityId ?? null) === (b.cityId ?? null)

/*
 * Role and scope are chosen together and saved as ONE change (PUT
 * /users/:id/assignment): each is only valid against the other, and saving
 * either clears every permission — once, with one confirmation.
 */
export function AssignmentForm(props: Props) {
  const { userId, roles, currentRoleId, currentScope, currentLabels, grantCount, isGlobalActor, actorCountries, updatedAt } = props
  const [roleId, setRoleId]   = useState(currentRoleId ?? "")
  const [scopes, setScopes]   = useState<ScopeEntry[]>(currentScope ? [currentScope] : [])
  const [confirming, setConfirming] = useState(false)
  const { save, pending, error, stale, reload, clearError } = useSaveRequest(`/api/identity/users/${encodeURIComponent(userId)}/assignment`, "PUT")

  const tiersOf = (id: string) => roles.find((r) => r.id === id)?.allowedScopes ?? []
  const scope   = scopes[0]
  const changed = roleId !== (currentRoleId ?? "") || !sameScope(scope, currentScope)
  // A preview only; the backend validates the pair.
  const complete = !!roleId && !!scope && (scope.scopeType === "GLOBAL" || (scope.scopeType === "COUNTRY" ? !!scope.countryId : !!scope.cityId))

  function pickRole(id: string) {
    setRoleId(id)
    // A scope the new role cannot hold is dropped rather than kept as a silent mismatch.
    if (scope && !tiersOf(id).includes(scope.scopeType)) setScopes([])
  }
  function discard() {
    setRoleId(currentRoleId ?? ""); setScopes(currentScope ? [currentScope] : []); clearError()
  }
  async function confirm() {
    const ok = await save({ roleId, scopes, expectedUpdatedAt: updatedAt }, "Role and scope updated", "Every permission was cleared — assign them again below.")
    if (ok) setConfirming(false)
  }

  const nextRole = roles.find((r) => r.id === roleId)?.displayName ?? "—"

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="space-y-1.5">
          <Label>Role</Label>
          <RoleCombobox roles={roles} value={roleId} onChange={pickRole} />
          {roleId && <p className="text-xs text-muted-foreground">{roles.find((r) => r.id === roleId)?.description}</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Geographic scope</Label>
          <ScopeSelector
            isGlobalActor={isGlobalActor}
            actorCountries={actorCountries}
            value={scopes}
            onChange={setScopes}
            showHeader={false}
            allowedTiers={roleId ? tiersOf(roleId) : undefined}
          />
        </div>
      </div>

      {changed && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-600/25 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <ShieldAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
          Saving a new role or scope removes all {grantCount} of this account&apos;s permissions. Assign them again afterwards.
        </p>
      )}
      {!confirming && <SaveError error={error} stale={stale} onReload={reload} />}

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/60 pt-4">
        {changed && (
          <Button type="button" variant="neutral" className="group" disabled={pending} onClick={discard}>
            <RotateCcw className="transition-transform duration-300 group-hover:-rotate-180" />
            Discard changes
          </Button>
        )}
        <Button type="button" variant="solid-warning" size="lg" className="group" disabled={pending || !changed || !complete} onClick={() => { clearError(); setConfirming(true) }}>
          <ShieldAlert className="transition-transform duration-200 group-hover:scale-110" />
          Save role &amp; scope
        </Button>
      </div>

      <AlertDialog open={confirming} onOpenChange={(open) => { if (!open && !pending) setConfirming(false) }}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <AlertDialogTitle>Change role and scope?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-lg border border-border bg-muted/30 p-3 text-foreground">
                  <div><p className="text-xs text-muted-foreground">Now</p><p className="font-medium">{currentLabels.role}</p><p className="text-xs">{currentLabels.scope}</p></div>
                  <ArrowRight aria-hidden className="h-4 w-4 text-muted-foreground" />
                  <div><p className="text-xs text-muted-foreground">After</p><p className="font-medium">{nextRole}</p><p className="text-xs">{scopeText(scope)}</p></div>
                </div>
                <p><strong>All {grantCount} permission{grantCount === 1 ? "" : "s"} will be removed.</strong> They are assigned again for the new role and scope.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <SaveError error={error} stale={stale} onReload={reload} />
          <AlertDialogFooter>
            <Button type="button" variant="neutral" className="group" disabled={pending} onClick={() => setConfirming(false)}>
              <X className="transition-transform duration-200 group-hover:rotate-90" />
              Cancel
            </Button>
            <Button type="button" variant="solid-warning" className="group" disabled={pending} onClick={confirm}>
              {pending ? <Loader2 className="animate-spin" /> : <ShieldAlert className="transition-transform duration-200 group-hover:scale-110" />}
              Confirm change
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function scopeText(scope: ScopeEntry | undefined): string {
  if (!scope) return "—"
  if (scope.scopeType === "GLOBAL") return "Global"
  return scope.scopeType === "COUNTRY" ? "One country" : "One city"
}
