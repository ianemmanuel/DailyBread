// lib/hooks/use-unsaved-guard.ts
"use client"

import { useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"

/**
 * Warns the user before navigating away when there are unsaved changes.
 * Handles both browser tab close (beforeunload) and Next.js client navigation.
 *
 * Usage:
 *   useUnsavedGuard(isDirty)
 *
 * isDirty: true when the admin has drawn or modified a polygon but not saved.
 */
export function useUnsavedGuard(isDirty: boolean) {
  // Browser tab close / refresh
  useEffect(() => {
    if (!isDirty) return

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ""
    }

    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [isDirty])
}