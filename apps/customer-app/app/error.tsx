"use client"

import * as React from "react"
import { AlertTriangle, RotateCw } from "lucide-react"
import { Button } from "@repo/ui/components/button"

/*
 * The route-level error boundary.
 *
 * Says something went wrong on OUR side rather than blaming the visitor's
 * location or their basket — both are intact, and implying otherwise sends
 * someone off to "fix" something that was never broken.
 *
 * The digest is surfaced because it is the only handle support has on a
 * production error; the message itself is deliberately not shown, since a
 * server error string is for logs, not for customers.
 */
export default function Error({
  error, reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  React.useEffect(() => {
    console.error("[customer-app]", error)
  }, [error])

  return (
    <div className="shell flex flex-col items-center gap-5 py-24 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-[var(--destructive-bg)]">
        <AlertTriangle className="size-7 text-[var(--destructive)]" />
      </div>
      <div className="max-w-md space-y-2">
        <h1 className="heading-lg text-[var(--foreground)]">Something went wrong</h1>
        <p className="text-sm leading-relaxed text-[var(--muted-foreground)]">
          This one is on us. Your basket and your saved location are untouched — try again,
          and it should come straight back.
        </p>
      </div>
      <Button onClick={reset} size="lg" className="cursor-pointer gap-2">
        <RotateCw className="size-4" />
        Try again
      </Button>
      {error.digest && (
        <p className="font-mono text-xs text-[var(--muted-foreground)]">
          Reference: {error.digest}
        </p>
      )}
    </div>
  )
}
