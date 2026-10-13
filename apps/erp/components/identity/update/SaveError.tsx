"use client"

import { AlertCircle, RotateCw } from "lucide-react"
import { Button } from "@/components/ui/button"

/** A refused save, with a way back to the latest state when the form was stale. */
export function SaveError({ error, stale, onReload }: { error: string | null; stale: boolean; onReload: () => void }) {
  if (!error) return null
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
      <p className="flex items-start gap-2"><AlertCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>
      {stale && (
        <Button type="button" size="sm" variant="outline" onClick={onReload}>
          <RotateCw />
          Load latest
        </Button>
      )}
    </div>
  )
}
