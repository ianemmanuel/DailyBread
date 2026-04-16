"use client"

import { useState, useEffect, useRef } from "react"
import { Checkbox }                    from "@repo/ui/components/checkbox"
import { Label }                       from "@repo/ui/components/label"
import { AdminPermission } from "@/types"


interface Props {
  roleId?         : string
  selectedKeys?   : string[]
  onChange?       : (keys: string[]) => void
  useHiddenInputs?: boolean
}


export function PermissionPicker({
  roleId,
  selectedKeys = [],
  onChange,
  useHiddenInputs = false,
}: Props) {
  const [pool,     setPool]     = useState<AdminPermission[]>([])
  const [loading,  setLoading]  = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [atBottom, setAtBottom] = useState(false)
  const scrollRef               = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!roleId) { setPool([]); return }
    setLoading(true)
    fetch(`/api/identity/roles/${roleId}/pool`)
      .then((r) => r.json())
      .then((data) => {
        const perms: AdminPermission[] = data.permissions ?? []
        setPool(perms)
        if (onChange) {
          const poolKeys = new Set(perms.map((p) => p.key))
          const filtered = selectedKeys.filter((k) => poolKeys.has(k))
          if (filtered.length !== selectedKeys.length) onChange(filtered)
        }
      })
      .catch(() => setPool([]))
      .finally(() => setLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleId])

  function handleScroll() {
    const el = scrollRef.current
    if (!el) return
    setScrolled(el.scrollTop > 8)
    setAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 8)
  }

  const selectedSet = new Set(selectedKeys)

  function toggle(key: string) {
    const next = new Set(selectedSet)
    next.has(key) ? next.delete(key) : next.add(key)
    onChange?.([...next])
  }

  function toggleAll() {
    const allKeys = pool.map((p) => p.key)
    onChange?.(selectedSet.size === pool.length ? [] : allKeys)
  }

  if (!roleId) return <p className="text-sm text-muted-foreground">Select a role above to see available permissions.</p>
  if (loading) return (
    <div className="space-y-2">
      {[1,2,3,4].map((i) => <div key={i} className="h-10 animate-pulse rounded-lg bg-muted/40" />)}
    </div>
  )
  if (pool.length === 0) return <p className="text-sm text-muted-foreground">No permissions available for this role.</p>

  const byModule = pool.reduce<Record<string, AdminPermission[]>>((acc, p) => {
    (acc[p.module] ??= []).push(p)
    return acc
  }, {})

  return (
    <div className="space-y-3">
      {useHiddenInputs && selectedKeys.map((key) => (
        <input key={key} type="hidden" name="permissions" value={key} />
      ))}

      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {selectedSet.size} of {pool.length} selected
        </p>
        <button type="button" onClick={toggleAll} className="text-xs text-primary hover:underline focus:outline-none">
          {selectedSet.size === pool.length ? "Deselect all" : "Select all"}
        </button>
      </div>

      {/* Scrollable container with fade */}
      <div className="relative">
        {/* Top fade when scrolled */}
        {scrolled && (
          <div className="pointer-events-none absolute top-0 left-0 right-0 z-10 h-6 rounded-t-lg"
            style={{ background: "linear-gradient(to bottom, var(--card) 0%, transparent 100%)" }} />
        )}

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="max-h-105 overflow-y-auto rounded-lg border border-border/50 p-3 space-y-5"
          style={{ scrollbarWidth: "thin" }}
        >
          {Object.entries(byModule).map(([module, perms]) => (
            <div key={module}>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 sticky top-0 bg-card py-1 z-1">
                {module.replace(/_/g, " ")}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {perms.map((p) => {
                  const isChecked = selectedSet.has(p.key)
                  return (
                    <label
                      key={p.key}
                      htmlFor={`perm-${p.key}`}
                      className={[
                        "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                        isChecked
                          ? "border-primary/40 bg-primary/5"
                          : "border-border/50 hover:border-primary/30 hover:bg-muted/30",
                      ].join(" ")}
                    >
                      <Checkbox
                        id={`perm-${p.key}`}
                        checked={isChecked}
                        onCheckedChange={() => toggle(p.key)}
                        className="mt-0.5 shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground leading-tight">
                          {p.key.split(":").slice(1).join(":")}
                        </p>
                        {p.description && (
                          <p className="mt-0.5 text-xs text-muted-foreground leading-snug">{p.description}</p>
                        )}
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Bottom fade — shows there's more to scroll */}
        {!atBottom && pool.length > 6 && (
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-10 rounded-b-lg"
            style={{ background: "linear-gradient(to top, var(--card) 0%, transparent 100%)" }} />
        )}
      </div>
    </div>
  )
}