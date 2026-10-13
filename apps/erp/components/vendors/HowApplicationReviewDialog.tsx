"use client"

import { useState } from "react"
import { HelpCircle, UserCheck, Clock, CheckCircle2, ArrowRightLeft, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog"

const STEPS = [
  {
    icon : UserCheck,
    badge: "icon-badge-primary",
    title: "1. Claim",
    body : "Claiming an application makes you its reviewer — everyone else's action buttons stay hidden until it's reassigned.",
  },
  {
    icon : Clock,
    badge: "icon-badge-warning",
    title: "2. Review",
    body : "Mark it under review, check documents, and request revisions if something's missing or unclear.",
  },
  {
    icon : CheckCircle2,
    badge: "icon-badge-success",
    title: "3. Decide",
    body : "Approve to create the vendor account automatically, or reject with a reason the applicant can act on.",
  },
]

const FALLBACKS = [
  {
    icon: ArrowRightLeft,
    title: "Reassign",
    body: "Hand a claimed application to another eligible reviewer — useful when workload needs to shift.",
  },
  {
    icon: TriangleAlert,
    title: "Escalate",
    body: "Send it up for higher-level attention. You lose access to it once escalated — only the receiving team, country-scoped, can pick it up from there.",
  },
]

/**
 * Moved off /vendors (see CLAUDE.md) — the workflow guide belongs on the
 * page it explains, not the module's landing page. A button at the
 * bottom of /vendors/applications opens this same content in a scrollable
 * AlertDialog instead.
 */
export function HowApplicationReviewDialog() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="gap-1.5 rounded-full" onClick={() => setOpen(true)}>
        <HelpCircle className="h-3.5 w-3.5" />
        How application review works
      </Button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent className="max-w-lg rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>How application review works</AlertDialogTitle>
            <AlertDialogDescription>The path most applications take, start to finish.</AlertDialogDescription>
          </AlertDialogHeader>

          <div className="max-h-[60vh] space-y-5 overflow-y-auto pr-1">
            <div className="grid gap-4 sm:grid-cols-3">
              {STEPS.map(({ icon: Icon, badge, title, body }) => (
                <div key={title} className="space-y-2">
                  <div className={`icon-badge ${badge} h-9 w-9`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <p className="text-sm font-medium text-foreground">{title}</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-3 border-t border-border/60 pt-4 sm:grid-cols-2">
              {FALLBACKS.map(({ icon: Icon, title, body }) => (
                <div key={title} className="flex items-start gap-2.5">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    <span className="font-medium text-foreground">{title}.</span> {body}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
