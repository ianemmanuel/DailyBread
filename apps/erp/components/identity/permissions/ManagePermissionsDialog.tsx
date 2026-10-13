"use client"

import { useState } from "react"
import { KeyRound, ShieldPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog"
import type { PermissionOptions } from "@/types"
import { PermissionEditor } from "./PermissionEditor"

/** Rendered only when the server offered delegation or recovery for this target. */
export function ManagePermissionsDialog({ options }: { options: PermissionOptions }) {
  const [open, setOpen] = useState(false)
  // A fresh editor per opening, and whenever the server's grants change (a
  // reload after a stale save), so nothing from an older state lingers.
  const [session, setSession] = useState(0)
  const firstGrant = options.grants.length === 0
  const { target } = options

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (next) setSession((n) => n + 1)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="solid-info" className="group">
          {firstGrant ? <ShieldPlus className="transition-transform duration-200 group-hover:scale-110" /> : <KeyRound className="transition-transform duration-200 group-hover:-rotate-12" />}
          {firstGrant ? "Assign permissions" : "Manage permissions"}
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[90dvh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Permissions — {target.firstName} {target.lastName}</DialogTitle>
          <DialogDescription>
            {target.role?.displayName ?? "No role"}{target.scopeLabel ? ` · ${target.scopeLabel}` : ""}.
            {" "}Only permissions in this role&apos;s pool can be granted.
          </DialogDescription>
        </DialogHeader>
        <PermissionEditor
          key={`${session}:${options.grants.join(",")}`}
          options={options}
          scrollClassName="max-h-[50dvh]"
          onSaved={() => setOpen(false)}
          onCancel={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
