"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, UserCheck, Bell } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ClaimAllComplianceResult } from "@/types"

interface Props {
  vendorId: string
  /** VENDORS_COMPLIANCE_CLAIM — nothing to claim if false */
  canClaim: boolean
  /** Whether there's at least one currently-unclaimed, non-waived issue */
  hasClaimable: boolean
  /** VENDORS_ACCOUNTS_COMPLIANCE_MANAGE — notify the vendor about the missing payout account */
  canManage: boolean
  hasMissingPayoutAccount: boolean
}

/**
 * Header-level actions for the vendor compliance detail page — "Claim
 * all" (the single-point-of-contact convenience described in CLAUDE.md's
 * compliance-ownership decision) and, when relevant, a "Notify about
 * payout account" nudge for the operational (non-document) issue.
 */
export function ComplianceVendorHeaderActions({ vendorId, canClaim, hasClaimable, canManage, hasMissingPayoutAccount }: Props) {
  const router = useRouter()
  const [claiming, setClaiming] = useState(false)
  const [notifying, setNotifying] = useState(false)

  async function doClaimAll() {
    setClaiming(true)
    try {
      const res = await fetch(`/api/vendors/compliance/vendor/${vendorId}/claim-all`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) { toast.error("Failed to claim all", { description: data.message }); return }
      const result = data.data as ClaimAllComplianceResult
      if (result.claimed.length > 0) toast.success(`Claimed ${result.claimed.length} issue${result.claimed.length === 1 ? "" : "s"}`)
      else if (result.alreadyMine.length > 0 && result.skipped.length === 0) toast.success("Everything claimable was already yours")
      else toast.success("Nothing left to claim")
      if (result.skipped.length > 0) {
        toast.warning(`${result.skipped.length} issue${result.skipped.length === 1 ? "" : "s"} couldn't be claimed`, {
          description: result.skipped.map((s) => `${s.documentTypeName}: ${s.reason}`).join("; "),
        })
      }
      router.refresh()
    } finally {
      setClaiming(false)
    }
  }

  async function doNotifyPayout() {
    setNotifying(true)
    try {
      const res = await fetch(`/api/vendors/compliance/vendor/${vendorId}/notify-payout`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) { toast.error("Failed to notify", { description: data.message }); return }
      toast.success(data?.data?.sent ? "Vendor notified by email" : "Notification recorded (email not sent — not configured)")
    } finally {
      setNotifying(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canClaim && hasClaimable && (
        <Button type="button" variant="outline" size="sm" className="rounded-full gap-1.5" disabled={claiming} onClick={doClaimAll}>
          {claiming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />}
          Claim all
        </Button>
      )}
      {canManage && hasMissingPayoutAccount && (
        <Button type="button" variant="outline" size="sm" className="rounded-full gap-1.5" disabled={notifying} onClick={doNotifyPayout}>
          {notifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bell className="h-3.5 w-3.5" />}
          Notify about payout account
        </Button>
      )}
    </div>
  )
}
