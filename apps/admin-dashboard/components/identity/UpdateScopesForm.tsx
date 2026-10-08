"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { MapPin, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog"
import { ScopeSelector } from "@/components/identity/ScopeSelector"
import type { ScopeEntry, AdminUserScope } from "@/types"

interface Props {
  userId        : string
  currentScopes : AdminUserScope[]
  isGlobalActor : boolean
  actorCountries: string[]
}

/**
 * UpdateScopesForm — edits an existing admin user's geographic scope.
 * PATCHes /api/identity/users/[id]/scopes. Reuses the same ScopeSelector
 * shown during creation (see its docstring).
 */
export function UpdateScopesForm({ userId, currentScopes, isGlobalActor, actorCountries }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // One scope per admin. A record from before that rule may still hold
  // several: the editor starts from the first, and says so, because saving
  // replaces them all with exactly the one shown.
  const legacyMultiScope = currentScopes.length > 1
  const initialScopes: ScopeEntry[] = currentScopes.slice(0, 1).map((s) => ({
    scopeType: s.scopeType,
    countryId: s.countryId ?? undefined,
    cityId   : s.cityId ?? undefined,
  }))
  const [scopes, setScopes] = useState<ScopeEntry[]>(initialScopes)

  function closeDialog() {
    setOpen(false)
    setScopes(initialScopes)
    setError(null)
  }

  async function submit() {
    setError(null)
    if (scopes.length !== 1) { setError("Set exactly one scope: global, one country, or one city."); return }
    setPending(true)
    try {
      const res = await fetch(`/api/identity/users/${userId}/scopes`, {
        method : "PATCH",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ scopes }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success("Scope updated")
        setOpen(false)
        router.refresh()
      } else {
        setError(data.message ?? "Failed to update scope.")
      }
    } catch {
      setError("Network error. Please try again.")
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <Button type="button" size="sm" variant="outline" className="rounded-full" onClick={() => setOpen(true)}>
        Edit Scope
      </Button>

      <AlertDialog open={open} onOpenChange={(o) => !o && closeDialog()}>
        <AlertDialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl">
          <AlertDialogHeader>
            <div className="icon-badge icon-badge-primary h-11 w-11">
              <MapPin className="h-5 w-5" />
            </div>
            <AlertDialogTitle>Edit geographic scope</AlertDialogTitle>
            <AlertDialogDescription>
              Defines where this admin works: global, one country, or one city. You can only assign a scope within your own access.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <ScopeSelector
            isGlobalActor={isGlobalActor}
            actorCountries={actorCountries}
            value={scopes}
            onChange={setScopes}
            showHeader={false}
          />

          {legacyMultiScope && (
            <p className="text-sm text-warning">
              This admin has {currentScopes.length} scopes from before the one-scope rule and currently has no
              access until it is fixed. Saving replaces them with the single scope above.
            </p>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <AlertDialogFooter>
            <Button type="button" variant="outline" className="rounded-full" onClick={closeDialog} disabled={pending}>
              Cancel
            </Button>
            <Button
              type="button"
              className="rounded-full gap-1.5"
              disabled={pending || scopes.length === 0}
              onClick={submit}
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {pending ? "Saving…" : "Save Scope"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
