"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@repo/ui/components/button"
import { PermissionPicker } from "@/components/identity/PermissionPicker"

interface Props {
  userId      : string
  roleId      : string
  currentKeys : string[]
}

/**
 * UpdatePermissionsForm — client component.
 * PUTs to /api/admin/identity/users/[id]/permissions.
 */
export function UpdatePermissionsForm({ userId, roleId, currentKeys }: Props) {
  const router  = useRouter()
  const [isPending, startTransition] = useTransition()
  const [permKeys, setPermKeys] = useState<string[]>(currentKeys)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const res = await fetch(`/api/admin/users/${userId}/permissions`, {
        method : "PUT",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ permissionKeys: permKeys }),
      })
      if (res.ok) {
        setSaved(true)
        router.refresh()
      } else {
        const data = await res.json()
        setError(data.message ?? "Failed to update permissions.")
      }
    })
  }

  return (
    <div className="space-y-4">
      <PermissionPicker
        roleId={roleId}
        selectedKeys={permKeys}
        onChange={setPermKeys}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      {saved && <p className="text-xs text-[var(--color-success)]">Permissions saved.</p>}
      <Button size="sm" onClick={handleSave} disabled={isPending}>
        {isPending ? "Saving…" : "Save Permissions"}
      </Button>
    </div>
  )
}