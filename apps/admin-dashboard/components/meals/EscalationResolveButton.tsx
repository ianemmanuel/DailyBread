"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { CheckCircle2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter,
} from "@/components/ui/alert-dialog"

/*
 * Closes ONE escalation. Resolving records that a country admin has dealt with
 * it — any action itself is taken on the listing, with its own reason. Shown
 * only where the server said canResolve.
 */
export function EscalationResolveButton({ id, dishName }: { id: string; dishName: string }) {
  const router = useRouter()
  const [open, setOpen]       = useState(false)
  const [note, setNote]       = useState("")
  const [pending, setPending] = useState(false)

  async function resolve() {
    setPending(true)
    const res = await fetch(`/api/meals/escalations/${id}/resolve`, {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify(note.trim() ? { note: note.trim() } : {}),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) { toast.success("Escalation resolved"); setOpen(false); router.refresh() }
    else toast.error(data.message ?? "Something went wrong")
    setPending(false)
  }

  return (
    <>
      <Button type="button" size="sm" variant="success" className="gap-1.5 rounded-full" onClick={() => { setNote(""); setOpen(true) }}>
        <CheckCircle2 className="h-3.5 w-3.5" />
        Resolve
      </Button>
      <AlertDialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Resolve the escalation on {dishName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Marks it dealt with. Take any action on the listing itself first — resolving changes nothing on it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label className="text-xs">Note (optional)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} className="min-h-20 text-sm"
              placeholder="What you decided — internal only." />
          </div>
          <AlertDialogFooter>
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
            <Button type="button" variant="success" className="gap-1.5 rounded-full" onClick={resolve} disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Resolve
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
