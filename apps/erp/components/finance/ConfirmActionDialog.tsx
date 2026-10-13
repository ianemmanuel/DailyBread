"use client"

import { useState, type ReactNode } from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog"

interface Props {
  trigger: ReactNode
  title: string
  description: ReactNode
  confirmLabel: string
  icon?: ReactNode
  iconBadgeClass?: string
  variant?: "default" | "destructive"
  reason?: { label: string; placeholder?: string; minLength?: number }
  /** Return true on success — the dialog closes. Return false to keep it open. */
  onConfirm: (reason?: string) => Promise<boolean>
}

/**
 * Shared confirm dialog for the finance-config lifecycle actions — shadcn
 * AlertDialog, never window.confirm/prompt. Optional reason field for
 * actions that require one (disable, suspend).
 */
export function ConfirmActionDialog({
  trigger, title, description, confirmLabel, icon, iconBadgeClass = "icon-badge-primary",
  variant = "default", reason, onConfirm,
}: Props) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [reasonText, setReasonText] = useState("")

  const minLen = reason?.minLength ?? 3
  const reasonValid = !reason || reasonText.trim().length >= minLen

  async function confirm() {
    if (!reasonValid) return
    setPending(true)
    try {
      const ok = await onConfirm(reason ? reasonText.trim() : undefined)
      if (ok) { setOpen(false); setReasonText("") }
    } finally {
      setPending(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!pending) setOpen(v) }}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent className="rounded-2xl">
        <AlertDialogHeader>
          {icon && <div className={`icon-badge h-11 w-11 ${iconBadgeClass}`}>{icon}</div>}
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        {reason && (
          <div className="space-y-1.5">
            <Label className="text-xs">{reason.label}</Label>
            <Textarea
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              placeholder={reason.placeholder}
              className="rounded-xl text-sm"
              rows={3}
            />
          </div>
        )}

        <AlertDialogFooter>
          <Button type="button" variant="outline" className="rounded-full" disabled={pending} onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant={variant}
            className="gap-1.5 rounded-full"
            disabled={pending || !reasonValid}
            onClick={confirm}
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {pending ? "Working…" : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
