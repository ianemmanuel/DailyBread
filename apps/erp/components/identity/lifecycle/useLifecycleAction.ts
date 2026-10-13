"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { LIFECYCLE_ACTIONS, type LifecycleAction } from "./lifecycle-actions"

/**
 * Runs one lifecycle action through the ERP proxy. Resolves true only once the
 * backend has accepted it; a refusal is kept in `error` for the caller to show.
 */
export function useLifecycleAction(userId: string) {
  const router = useRouter()
  const [pending, setPending] = useState<LifecycleAction | null>(null)
  const [error, setError]     = useState<string | null>(null)

  async function run(action: LifecycleAction, body?: { reason: string }): Promise<boolean> {
    setPending(action)
    setError(null)
    try {
      const res = await fetch(`/api/identity/users/${encodeURIComponent(userId)}/${action}`, {
        method : "POST",
        headers: { "Content-Type": "application/json" },
        body   : body ? JSON.stringify(body) : undefined,
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const message = data.message ?? "The action was not completed."
        setError(message)
        toast.error("Action failed", { description: message })
        return false
      }
      toast.success(LIFECYCLE_ACTIONS[action].success)
      router.refresh()
      return true
    } catch {
      setError("Network error — the action was not completed.")
      return false
    } finally {
      setPending(null)
    }
  }

  return { run, pending, error, clearError: () => setError(null) }
}
