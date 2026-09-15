"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Power, PauseCircle, Archive, RotateCcw, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmActionDialog } from "./ConfirmActionDialog"

interface Props {
  countrySlug: string
  account: { id: string; status: string }
  /** Is this the account the country's bank-account-verification capability routes through? */
  isBankVerificationAccount: boolean
  /** Does this account enable BANK_ACCOUNT_RESOLUTION (i.e. can it be the bank-verification account)? */
  enablesBankVerification: boolean
  configStatus: string
  canManageDraft: boolean
  canManageLifecycle: boolean
}

/*
 * The two axes an admin controls for a CountryProviderAccount, kept
 * verbally distinct:
 *
 *  - Lifecycle (Enable / Disable / Archive / Restore) — is this account's
 *    integration usable at all. Backed by the /provider-accounts/:id/*
 *    lifecycle endpoints. A country may have MANY enabled accounts at once,
 *    one per capability domain.
 *  - Bank-verification routing (Use for bank verification) — which enabled
 *    account serves the country-global BANK_ACCOUNT_RESOLUTION / BANK_LIST
 *    capability. Backed by CountryFinancialConfig.bankVerificationProviderAccountId.
 *    Collection/payout routing is per payment method, on the wiring list —
 *    there is no "primary provider" for the country.
 *
 * Backend verbs (activate/suspend/disable/restore) are internal; the UI
 * words are Enable/Disable/Archive/Restore.
 */
export function ProviderAccountActions({
  countrySlug, account, isBankVerificationAccount, enablesBankVerification, configStatus, canManageDraft, canManageLifecycle,
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  async function post(url: string, body?: unknown): Promise<boolean> {
    try {
      const res = await fetch(url, {
        method: url.includes("/financial-config/") ? "PATCH" : "POST",
        headers: body ? { "Content-Type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success(data.message ?? "Done")
        startTransition(() => router.refresh())
        return true
      }
      toast.error(data.message ?? "Action failed")
      return false
    } catch {
      toast.error("Network error")
      return false
    }
  }

  const acctBase = `/api/finance/provider-accounts/${account.id}`
  const isArchived = account.status === "DISABLED"
  const canBeEnabled = account.status === "DRAFT" || account.status === "SUSPENDED"

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
      {canManageDraft && enablesBankVerification && !isBankVerificationAccount && !isArchived && configStatus !== "DISABLED" && (
        <ConfirmActionDialog
          trigger={
            <Button size="sm" variant="outline" className="gap-1 rounded-full text-xs">
              <ShieldCheck className="h-3 w-3" /> Use for bank verification
            </Button>
          }
          icon={<ShieldCheck className="h-5 w-5" />}
          title="Route bank-account verification through this account?"
          description="Automatic vendor payout-account verification and the bank directory vendors pick from will use this provider account. It must be enabled before it can process anything. Collection and payout routing are set per payment method, separately."
          confirmLabel="Use for bank verification"
          onConfirm={() =>
            post(`/api/finance/countries/${countrySlug}/financial-config/bank-verification-account`, {
              providerAccountId: account.id,
            })
          }
        />
      )}

      {canManageDraft && isBankVerificationAccount && configStatus !== "DISABLED" && (
        <ConfirmActionDialog
          trigger={
            <Button size="sm" variant="outline" className="gap-1 rounded-full text-xs text-warning border-warning/30">
              <ShieldCheck className="h-3 w-3" /> Stop using for bank verification
            </Button>
          }
          icon={<ShieldCheck className="h-5 w-5" />}
          iconBadgeClass="icon-badge-warning"
          title="Clear the bank-verification route?"
          description="The country will have no automatic bank-account verification — vendor payout accounts fall back to structural checks plus manual review. You can re-assign a provider account at any time."
          confirmLabel="Clear route"
          variant="destructive"
          onConfirm={() =>
            post(`/api/finance/countries/${countrySlug}/financial-config/bank-verification-account`, {
              providerAccountId: null,
            })
          }
        />
      )}

      {canManageLifecycle && canBeEnabled && (
        <ConfirmActionDialog
          trigger={
            <Button size="sm" className="gap-1 rounded-full text-xs">
              <Power className="h-3 w-3" /> Enable
            </Button>
          }
          icon={<Power className="h-5 w-5" />}
          iconBadgeClass="icon-badge-success"
          title="Enable this provider account?"
          description="The account's credentials and capabilities become live. A country can run several enabled accounts at once — one per capability (collection, payout, bank verification). Enabling this one does not disable any other."
          confirmLabel="Enable"
          onConfirm={() => post(`${acctBase}/activate`)}
        />
      )}

      {canManageLifecycle && account.status === "ACTIVE" && (
        <ConfirmActionDialog
          trigger={
            <Button size="sm" variant="outline" className="gap-1 rounded-full text-xs text-warning border-warning/30">
              <PauseCircle className="h-3 w-3" /> Disable
            </Button>
          }
          icon={<PauseCircle className="h-5 w-5" />}
          iconBadgeClass="icon-badge-warning"
          title="Disable this provider account?"
          description="A reversible pause — the account stays configured and can be re-enabled at any time. Any payment method or the bank-verification route pointing at it is unwired; while disabled it can't process anything."
          confirmLabel="Disable"
          variant="destructive"
          reason={{ label: "Reason", placeholder: "Why is this account being disabled?" }}
          onConfirm={(reason) => post(`${acctBase}/suspend`, { reason })}
        />
      )}

      {canManageLifecycle && !isArchived && (
        <ConfirmActionDialog
          trigger={
            <Button size="sm" variant="outline" className="gap-1 rounded-full text-xs text-destructive border-destructive/30">
              <Archive className="h-3 w-3" /> Archive
            </Button>
          }
          icon={<Archive className="h-5 w-5" />}
          iconBadgeClass="icon-badge-danger"
          title="Archive this provider account?"
          description="For decommissioning an account you're done with. It's unwired from every payment method and the bank-verification route, and kept for audit history. This is reversible — an archived account can be restored to a draft — but it's not a quick pause; use Disable for that."
          confirmLabel="Archive"
          variant="destructive"
          onConfirm={() => post(`${acctBase}/disable`)}
        />
      )}

      {canManageLifecycle && isArchived && (
        <ConfirmActionDialog
          trigger={
            <Button size="sm" variant="outline" className="gap-1 rounded-full text-xs">
              <RotateCcw className="h-3 w-3" /> Restore
            </Button>
          }
          icon={<RotateCcw className="h-5 w-5" />}
          title="Restore this provider account?"
          description="It comes back as a draft. You'll need to enable it and re-wire it (to a payment method, or as the bank-verification account) before it processes anything."
          confirmLabel="Restore"
          onConfirm={() => post(`${acctBase}/restore`)}
        />
      )}
    </div>
  )
}
