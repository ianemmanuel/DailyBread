"use client"

import { Button } from "@repo/ui/components/button"

export default function Error({
  error,
  reset,
}: {
  error: Error
  reset: () => void
}) {
  return (
    <div className="page-content text-center space-y-4">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">
        Failed to load user details. Please try again.
      </p>
      <Button onClick={() => reset()}>Retry</Button>
    </div>
  )
}