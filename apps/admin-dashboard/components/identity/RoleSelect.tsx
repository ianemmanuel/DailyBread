"use client"

import { useState }         from "react"
import { Label }            from "@repo/ui/components/label"
import type { AdminRole }   from "@/types"

interface Props {
  roles        : AdminRole[]
  defaultRoleId?: string
}

/**
 * RoleSelect — controlled role dropdown.
 * On change, stores selected roleId in state so PermissionPicker
 * can fetch the correct pool. The roleId is also submitted with the form.
 *
 * Client component — manages selected role state for the permission picker.
 */
export function RoleSelect({ roles, defaultRoleId }: Props) {
  const [selectedRoleId, setSelectedRoleId] = useState(defaultRoleId ?? "")

  return (
    <div className="space-y-1.5">
      <Label htmlFor="roleId">Role</Label>
      <select
        id="roleId"
        name="roleId"
        required
        value={selectedRoleId}
        onChange={(e) => {
          setSelectedRoleId(e.target.value)
          // Dispatch custom event so PermissionPicker can react
          window.dispatchEvent(
            new CustomEvent("roleChanged", { detail: { roleId: e.target.value } }),
          )
        }}
        className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground
                   focus:outline-none focus:ring-2 focus:ring-ring
                   dark:bg-card dark:border-border"
      >
        <option value="" disabled>Select a role…</option>
        {roles.map((r) => (
          <option key={r.id} value={r.id}>{r.displayName}</option>
        ))}
      </select>
      {selectedRoleId && (
        <p className="text-xs text-muted-foreground">
          {roles.find((r) => r.id === selectedRoleId)?.description}
        </p>
      )}
    </div>
  )
}