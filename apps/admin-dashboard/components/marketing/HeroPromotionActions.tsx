"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Archive, Loader2, Send } from "lucide-react"
import { toast } from "sonner"
import { AdminPermissions } from "@repo/types/enums"
import type { HeroPromotion } from "@repo/types/admin-app"

import { Button } from "@/components/ui/button"
import { useHasPermission } from "@/providers/admin-session-provider"

/*
 * Publish and withdraw.
 *
 * Their own control, separate from the edit form, because they are their own
 * permission: editing a draft is one kind of trust, changing what customers
 * see is another.
 *
 * TWO INDEPENDENT QUESTIONS, and both must be yes:
 *
 *   PERMISSION — may this admin publish anything at all? Read from the session
 *                here rather than passed in, so no caller can get it wrong and
 *                every call site gets the same answer.
 *   SCOPE      — may they publish THIS promotion? That is
 *                `promotion.canManage`, computed by the server from the guard
 *                that would refuse the write, never re-derived in the browser.
 *
 * Hiding the buttons is an affordance, not enforcement: the backend refuses
 * the action regardless.
 */
export function HeroPromotionActions({ promotion }: { promotion: HeroPromotion }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const hasPermission = useHasPermission(AdminPermissions.MARKETING_PROMOTIONS_PUBLISH)

  if (!hasPermission || !promotion.canManage) return null

  async function run(action: "publish" | "archive") {
    setBusy(action)
    try {
      const res = await fetch(
        `/api/marketing/hero-promotions/${promotion.id}/${action}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
      )
      const body = await res.json()
      if (!res.ok) throw new Error(body?.message ?? "That did not work")

      toast.success(action === "publish" ? "Promotion is live" : "Promotion withdrawn")
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "That did not work")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      {promotion.status !== "PUBLISHED" && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy !== null}
          onClick={() => void run("publish")}
        >
          {busy === "publish" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Send className="size-3.5" />
          )}
          Publish
        </Button>
      )}
      {promotion.status !== "ARCHIVED" && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={busy !== null}
          onClick={() => void run("archive")}
        >
          {busy === "archive" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Archive className="size-3.5" />
          )}
          Withdraw
        </Button>
      )}
    </div>
  )
}
