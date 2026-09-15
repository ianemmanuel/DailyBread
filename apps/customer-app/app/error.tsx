"use client"

import * as React from "react"
import { AlertTriangle, RotateCw } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  React.useEffect(() => {
    console.error("[customer-app]", error)
  }, [error])

  return (
    <div className="shell band flex flex-col items-center gap-5 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-destructive-bg">
        <AlertTriangle className="size-7 text-destructive" />
      </div>
      <div className="max-w-md space-y-2">
        <h1 className="heading-lg">Something went wrong</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          This one is on us. Try again, and it should come straight back.
        </p>
      </div>
      <Button onClick={reset} size="lg" className="gap-2">
        <RotateCw className="size-4" />
        Try again
      </Button>
      {error.digest && (
        <p className="font-mono text-xs text-muted-foreground">
          Reference: {error.digest}
        </p>
      )}
    </div>
  )
}
