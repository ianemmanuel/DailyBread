"use client"

import { Button } from "@/components/ui/button"

/*
 * "use client" is REQUIRED here — Next's error boundary passes `reset`, which
 * is a function, so this file cannot be a Server Component however static its
 * markup looks. That is a framework contract, not a choice.
 *
 * Kept deliberately plain for now, and with no logging side effect: a
 * `useEffect` that console.errors on every render is noise while the app has no
 * error reporter to send it to. Wire one up here when there is one.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex flex-1 items-center justify-center py-20">
      <div className="w-full max-w-md space-y-6 text-center">
        <p className="eyebrow justify-center">Something broke</p>
        <h1 className="heading-xl">This one is on us</h1>
        <p className="lede">
          Try again — it should come straight back.
        </p>
        <div className="flex justify-center pt-2">
          <Button onClick={reset} size="lg" className="h-11 rounded-full px-6">
            Try again
          </Button>
        </div>
        {error.digest && (
          <p className="font-mono text-xs text-muted-foreground">
            Reference: {error.digest}
          </p>
        )}
      </div>
    </div>
  )
}
