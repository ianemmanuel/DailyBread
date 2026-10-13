"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ShieldAlert, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog"
import { RoleCombobox } from "@/components/identity/RoleCombobox"
import type { AdminRole } from "@/types"

interface Props {
  userId         : string
  roles          : AdminRole[]
  currentRoleId  : string | null
  currentRoleName: string
}

/**
 * UpdateRoleForm — reassigns an admin user's role.
 * PATCHes /api/identity/users/[id]/role. The backend clears all existing
 * permission grants on role change (old grants belong to the old role's
 * pool) — the confirmation makes that explicit before submitting.
 */
export function UpdateRoleForm({ userId, roles, currentRoleId, currentRoleName }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [roleId, setRoleId] = useState(currentRoleId ?? "")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function closeDialog() {
    setOpen(false)
    setRoleId(currentRoleId ?? "")
    setError(null)
  }

  async function submit() {
    setError(null)
    setPending(true)
    try {
      const res = await fetch(`/api/identity/users/${userId}/role`, {
        method : "PATCH",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ roleId }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success("Role updated", {
          description: "All previous permission grants were cleared — assign permissions from the new role's pool.",
        })
        setOpen(false)
        router.refresh()
      } else {
        setError(data.message ?? "Failed to update role.")
      }
    } catch {
      setError("Network error. Please try again.")
    } finally {
      setPending(false)
    }
  }

  const selectedRole = roles.find((r) => r.id === roleId)
  const isChanged = roleId !== "" && roleId !== currentRoleId

  return (
    <>
      <Button type="button" size="xs" variant="ghost" className="text-primary" aria-label="Change role" onClick={() => setOpen(true)}>
        Change
      </Button>

      <AlertDialog open={open} onOpenChange={(o) => !o && closeDialog()}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <div className="icon-badge icon-badge-warning h-11 w-11">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <AlertDialogTitle>Change role</AlertDialogTitle>
            <AlertDialogDescription>
              Currently <strong>{currentRoleName}</strong>. <strong>Changing the role clears all of this admin&apos;s
              permissions</strong> — they are assigned again from the new role&apos;s pool afterwards. Only roles valid at
              their current scope are listed.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <RoleCombobox roles={roles} value={roleId} onChange={setRoleId} />

          {error && <p className="text-sm text-destructive">{error}</p>}

          <AlertDialogFooter>
            <Button type="button" variant="outline" className="rounded-full" onClick={closeDialog} disabled={pending}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="rounded-full gap-1.5"
              disabled={pending || !isChanged}
              onClick={submit}
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {pending ? "Saving…" : `Confirm — switch to ${selectedRole?.displayName ?? "role"}`}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
