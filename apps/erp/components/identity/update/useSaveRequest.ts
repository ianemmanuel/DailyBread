"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

const STALE_CODES = new Set(["ACCOUNT_CHANGED", "CONCURRENT_MODIFICATION", "STATUS_CHANGED"])

/**
 * One edit-page save: sends the body, reports the backend's refusal as-is and
 * flags a stale form (someone changed the account meanwhile) so the caller can
 * offer the latest state. Success refreshes the server-rendered page.
 */
export function useSaveRequest(url: string, method: "PATCH" | "PUT") {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [stale, setStale]     = useState(false)

  async function save(body: unknown, success: string, description?: string): Promise<boolean> {
    setPending(true); setError(null); setStale(false)
    try {
      const res  = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.message ?? "The changes were not saved.")
        setStale(STALE_CODES.has(data.code))
        return false
      }
      toast.success(success, description ? { description } : undefined)
      router.refresh()
      return true
    } catch {
      setError("Network error — the changes were not saved.")
      return false
    } finally {
      setPending(false)
    }
  }

  return { save, pending, error, stale, reload: () => router.refresh(), clearError: () => setError(null) }
}
