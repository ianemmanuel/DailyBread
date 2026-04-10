"use client"

import { useState, useEffect } from "react"

interface Permission {
  id     : string
  key    : string
  module : string
  description?: string | null
}

interface Props {
  roleId?      : string
  selectedKeys?: string[]
}

/**
 * PermissionPicker — dynamically loads the permission pool for a role
 * and renders a grouped checkbox list.
 *
 * - On the create form: listens for "roleChanged" custom event from RoleSelect
 * - On the edit form:   receives roleId as prop, loads pool on mount
 *
 * Permissions are grouped by module. Selected state is kept locally
 * and submitted as multiple `permissions` form values.
 */
export function PermissionPicker({ roleId: initialRoleId, selectedKeys = [] }: Props) {
  const [roleId,      setRoleId]      = useState(initialRoleId ?? "")
  const [pool,        setPool]        = useState<Permission[]>([])
  const [selected,    setSelected]    = useState<Set<string>>(new Set(selectedKeys))
  const [loading,     setLoading]     = useState(false)

  // Load pool whenever roleId changes
  useEffect(() => {
    if (!roleId) { setPool([]); return }

    setLoading(true)
    fetch(`/api/admin/roles/${roleId}/pool`)
      .then((r) => r.json())
      .then((data) => {
        setPool(data.permissions ?? [])
        // Remove any selected keys not in the new pool
        setSelected((prev) => {
          const poolKeys = new Set(data.permissions?.map((p: Permission) => p.key) ?? [])
          return new Set([...prev].filter((k) => poolKeys.has(k)))
        })
      })
      .finally(() => setLoading(false))
  }, [roleId])

  // Listen for role changes from RoleSelect (on create form)
  useEffect(() => {
    function handler(e: Event) {
      const { roleId: newRoleId } = (e as CustomEvent).detail
      setRoleId(newRoleId)
    }
    window.addEventListener("roleChanged", handler)
    return () => window.removeEventListener("roleChanged", handler)
  }, [])

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  // Group by module
  const byModule = pool.reduce<Record<string, Permission[]>>((acc, p) => {
    (acc[p.module] ??= []).push(p)
    return acc
  }, {})

  if (!roleId) {
    return <p className="text-sm text-muted-foreground">Select a role to see available permissions.</p>
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {[1,2,3].map((i) => (
          <div key={i} className="h-6 rounded bg-muted/50 animate-pulse" />
        ))}
      </div>
    )
  }

  if (pool.length === 0) {
    return <p className="text-sm text-muted-foreground">No permissions available for this role.</p>
  }

  return (
    <div className="space-y-4">
      {/* Hidden inputs for form submission */}
      {[...selected].map((key) => (
        <input key={key} type="hidden" name="permissions" value={key} />
      ))}

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {selected.size} of {pool.length} selected
        </p>
        <button
          type="button"
          onClick={() => setSelected(selected.size === pool.length ? new Set() : new Set(pool.map((p) => p.key)))}
          className="text-xs text-primary hover:underline"
        >
          {selected.size === pool.length ? "Deselect all" : "Select all"}
        </button>
      </div>

      {Object.entries(byModule).map(([module, perms]) => (
        <div key={module}>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60">
            {module.replace(/_/g, " ")}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {perms.map((p) => (
              <label
                key={p.key}
                className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border/50 px-3 py-2.5
                           hover:border-primary/40 hover:bg-primary/5 transition-colors
                           has-checked:border-primary/50 has-checked:bg-primary/8"
              >
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                  checked={selected.has(p.key)}
                  onChange={() => toggle(p.key)}
                />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {p.key.split(":").slice(1).join(":")}
                  </p>
                  {p.description && (
                    <p className="text-xs text-muted-foreground">{p.description}</p>
                  )}
                </div>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}