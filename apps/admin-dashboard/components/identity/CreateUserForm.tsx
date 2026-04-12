"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@repo/ui/components/button"
import { Input } from "@repo/ui/components/input"
import { Label } from "@repo/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select"
import { PermissionPicker } from "@/components/identity/PermissionPicker"
import type { AdminRole } from "@/types"

interface Props {
  roles: AdminRole[]
}

export function CreateUserForm({ roles }: Props) {
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [error, setError] = useState<string | null>(null)
    const [roleId, setRoleId] = useState("")
    const [permKeys, setPermKeys] = useState<string[]>([])

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault() 
        setError(null)

        const formData = new FormData(e.currentTarget)
        const email    = formData.get("email")    as string
        const fullName = formData.get("fullName") as string

        if (!roleId) {
            setError("Please select a role.")
            return
        }

        startTransition(() => {
            submit({ email, fullName })
        })
    }

    async function submit({ email, fullName }: { email: string; fullName: string }) {
        const res = await fetch("/api/admin/identity/users", {
            method : "POST",
            headers: { "Content-Type": "application/json" },
            body   : JSON.stringify({
            email,
            fullName,
            roleId,
            permissionKeys: permKeys,
            }),
        })

        if (res.ok) {
            router.push("/identity")
            router.refresh()
        } else {
            const data = await res.json()
            setError(data.message ?? "Failed to create user. Please try again.")
        }
    }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Basic info */}
      <div className="admin-card space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Basic Information</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="fullName">Full name</Label>
            <Input id="fullName" name="fullName" placeholder="Jane Doe" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email">Work email</Label>
            <Input id="email" name="email" type="email" placeholder="jane@dailybread.com" required />
          </div>
        </div>
      </div>

      {/* Role */}
      <div className="admin-card space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Role</h2>
        <p className="text-xs text-muted-foreground">
          The role defines the ceiling of permissions that can be granted to this user.
        </p>
        <div className="space-y-1.5">
          <Label>Role</Label>
          <Select onValueChange={setRoleId} required>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a role…" />
            </SelectTrigger>
            <SelectContent>
              {roles.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.displayName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {roleId && (
            <p className="text-xs text-muted-foreground">
              {roles.find((r) => r.id === roleId)?.description}
            </p>
          )}
        </div>
      </div>

      {/* Permissions */}
      <div className="admin-card space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Permissions</h2>
        <p className="text-xs text-muted-foreground">
          Select permissions within this role's pool. Can be updated later.
        </p>
        <PermissionPicker
          roleId={roleId || undefined}
          selectedKeys={permKeys}
          onChange={setPermKeys}
        />
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Creating…" : "Create User"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.push("/identity")}
          disabled={isPending}
        >
          Cancel
        </Button>
      </div>
    </form>
  )
}