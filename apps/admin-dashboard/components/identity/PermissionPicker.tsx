"use client"

import { useState, useEffect } from "react"
import { Permission } from "@/types"


interface Props {
  roleId?      : string
  selectedKeys?: string[]
  onChange?    : (keys: string[]) => void
  /** If true, renders hidden inputs for native form submission */
  useHiddenInputs?: boolean
}

/**
 * PermissionPicker — permission checkbox grid for a role's pool.
 *
 * Two modes:
 *   - Controlled (onChange prop): parent owns selection state (CreateUserForm)
 *   - Hidden inputs (useHiddenInputs): embeds <input type="hidden"> for server actions
 *
 * Permissions are grouped by module for easy scanning.
 * Fetches pool via /api/admin/roles/:roleId/pool route handler.
 */
export function PermissionPicker({
  roleId,
  selectedKeys = [],
  onChange,
  useHiddenInputs = false,
}: Props) {
  const [pool,    setPool]    = useState<Permission[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedKeys))
  const [loading,  setLoading]  = useState(false)

  // Sync external selectedKeys on mount / prop change
  useEffect(() => {
    setSelected(new Set(selectedKeys))
  }, [selectedKeys.join(",")])

  // Fetch pool when roleId changes
  useEffect(() => {
    if (!roleId) { setPool([]); return }

    setLoading(true)
    fetch(`/api/admin/roles/${roleId}/pool`)
      .then((r) => r.json())
      .then((data) => {
        const perms: Permission[] = data.permissions ?? []
        setPool(perms)
        // Remove keys no longer in pool
        setSelected((prev) => {
          const poolKeys = new Set(perms.map((p) => p.key))
          const next     = new Set([...prev].filter((k) => poolKeys.has(k)))
          onChange?.([...next])
          return next
        })
      })
      .catch(() => setPool([]))
      .finally(() => setLoading(false))
  }, [roleId])

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      onChange?.([...next])
      return next
    })
  }

  function toggleAll() {
    const allKeys = pool.map((p) => p.key)
    const next    = selected.size === pool.length ? [] : allKeys
    setSelected(new Set(next))
    onChange?.(next)
  }

  if (!roleId) {
    return <p className="text-sm text-muted-foreground">Select a role to see available permissions.</p>
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-6 animate-pulse rounded bg-muted/50" />
        ))}
      </div>
    )
  }

  if (pool.length === 0) {
    return <p className="text-sm text-muted-foreground">No permissions available for this role.</p>
  }

  const byModule = pool.reduce<Record<string, Permission[]>>((acc, p) => {
    (acc[p.module] ??= []).push(p)
    return acc
  }, {})

  return (
    <div className="space-y-4">
      {/* Hidden inputs for server action / form submission mode */}
      {useHiddenInputs && [...selected].map((key) => (
        <input key={key} type="hidden" name="permissions" value={key} />
      ))}

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {selected.size} of {pool.length} selected
        </p>
        <button type="button" onClick={toggleAll} className="text-xs text-primary hover:underline">
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
                className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border/50 px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-primary/5 has-[:checked]:border-primary/50 has-[:checked]:bg-primary/8"
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