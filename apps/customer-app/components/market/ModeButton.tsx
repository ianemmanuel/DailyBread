"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Loader2, MapPin, Store } from "lucide-react"

import { Button } from "@/components/ui/button"
import { setBrowsing } from "@/lib/market/actions"
import { cn } from "@/lib/utils"

/**
 * One click between "browse all of <city>" and "deliver to <point>". The same
 * action the market bar's picker performs, for the places on a page where the
 * customer is already looking at the consequence of the current mode.
 */
export function ModeButton({
  citySlug, browse, label, variant = "outline", className,
}: {
  citySlug  : string
  browse    : boolean
  label     : string
  variant?  : "default" | "outline" | "brand"
  className?: string
}) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  const [failed, setFailed] = React.useState(false)

  async function run() {
    setBusy(true)
    setFailed(false)
    try {
      await setBrowsing(citySlug, browse)
      router.refresh()
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  const Icon = busy ? Loader2 : browse ? Store : MapPin

  return (
    <Button
      type="button"
      variant={variant}
      onClick={run}
      disabled={busy}
      aria-live="polite"
      className={cn("h-10 rounded-full px-4", className)}
    >
      <Icon aria-hidden className={cn("size-4", busy && "animate-spin")} />
      {failed ? "Try again" : label}
    </Button>
  )
}
