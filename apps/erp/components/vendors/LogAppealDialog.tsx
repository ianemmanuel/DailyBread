"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Scale } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from "@/components/ui/alert-dialog"
import type { AppealSubjectType } from "@/types"

interface Props {
  subjectType  : AppealSubjectType
  applicationId?: string
  vendorId?    : string
  /** Shown on the trigger button — defaults to "Log Appeal". */
  label?: string
}

/**
 * Contextual "Log Appeal" trigger — used on the application detail page
 * (when REJECTED) and the vendor account detail page (when SUSPENDED or
 * the vendor is banned). Records an appeal the vendor raised through
 * another channel (email, support ticket) — there's no vendor-facing
 * self-service submission yet (Roadmap VM-P1-04, CLAUDE.md).
 */
export function LogAppealDialog({ subjectType, applicationId, vendorId, label = "Log Appeal" }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [pending, setPending] = useState(false)

  async function submit() {
    if (!reason.trim()) return
    setPending(true)
    const res = await fetch("/api/vendors/appeals", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ subjectType, applicationId, vendorId, reason: reason.trim() }),
    })
    const data = await res.json()
    if (res.ok) {
      toast.success("Appeal logged")
      setOpen(false)
      setReason("")
      router.refresh()
    } else {
      toast.error("Failed to log appeal", { description: data.message })
    }
    setPending(false)
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="rounded-full gap-1.5" onClick={() => setOpen(true)}>
        <Scale className="h-3.5 w-3.5" />
        {label}
      </Button>
      <AlertDialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <div className="icon-badge icon-badge-primary h-11 w-11"><Scale className="h-5 w-5" /></div>
            <AlertDialogTitle>Log an appeal</AlertDialogTitle>
            <AlertDialogDescription>
              Records that the vendor formally contested this decision through another channel. Tracked under Vendors → Appeals until resolved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs">Grounds for the appeal *</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What the vendor is disputing, and why…" className="min-h-24 text-sm" />
          </div>
          <AlertDialogFooter>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
            <Button type="button" className="rounded-full gap-1.5" disabled={pending || !reason.trim()} onClick={submit}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {pending ? "Saving…" : "Log Appeal"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
