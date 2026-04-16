"use client"

import { useEffect }  from "react"
import { useRouter }  from "next/navigation"
import { Button }     from "@repo/ui/components/button"
import { AlertTriangle } from "lucide-react"

interface Props {
  error   : Error & { digest?: string }
  reset   : () => void
}

export default function DashboardError({ error, reset }: Props) {
  const router = useRouter()

  useEffect(() => {
    // Log to your observability service
    console.error("[Dashboard Error]", error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">

      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10">
        <AlertTriangle className="h-8 w-8 text-destructive/70" />
      </div>

      <h1 className="font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
        Something went wrong
      </h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        An unexpected error occurred. This has been logged. If this keeps happening, contact engineering.
      </p>

      {error.digest && (
        <p className="mt-3 font-mono text-[11px] text-muted-foreground/50">
          Error ref: {error.digest}
        </p>
      )}

      <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
        <Button onClick={reset}>Try again</Button>
        <Button variant="ghost" onClick={() => router.push("/overview")}>
          Go to Overview
        </Button>
      </div>

    </div>
  )
}