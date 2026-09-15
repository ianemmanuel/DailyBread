"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Power, PauseCircle, Archive, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmActionDialog } from "./ConfirmActionDialog"

interface Props {
  countrySlug: string
  /** "NONE" when no config exists yet, else the config status. */
  configStatus: string
  canManageLifecycle: boolean
}

/**
 * Lifecycle for the country's financial configuration as a whole. Same
 * Enable-ish / Disable / Archive / Restore vocabulary as a single provider
 * account (ConfigLifecycleActions ⇄ ProviderAccountActions), so the page
 * reads consistently. "Activate" (not "Enable") only because country
 * activation itself gates on the config being active.
 */
export function ConfigLifecycleActions({ countrySlug, configStatus, canManageLifecycle }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  if (!canManageLifecycle || configStatus === "NONE") return null

  const base = `/api/finance/countries/${countrySlug}/financial-config`

  async function post(op: string, body?: unknown): Promise<boolean> {
    try {
      const res = await fetch(`${base}/${op}`, {
        method: "POST",
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

  const isArchived = configStatus === "DISABLED"

  return (
    <div className="flex flex-wrap gap-2">
      {(configStatus === "DRAFT" || configStatus === "SUSPENDED") && (
        <ConfirmActionDialog
          trigger={<Button size="sm" className="gap-1.5 rounded-full"><Power className="h-4 w-4" /> Activate config</Button>}
          icon={<Power className="h-5 w-5" />}
          iconBadgeClass="icon-badge-success"
          title="Activate this country's financial configuration?"
          description="Currency, the primary provider account and the collections/payouts switches are validated. The country can only be activated once its financial config is active."
          confirmLabel="Activate config"
          onConfirm={() => post("activate")}
        />
      )}

      {configStatus === "ACTIVE" && (
        <ConfirmActionDialog
          trigger={
            <Button size="sm" variant="outline" className="gap-1.5 rounded-full text-warning border-warning/30">
              <PauseCircle className="h-4 w-4" /> Disable
            </Button>
          }
          icon={<PauseCircle className="h-5 w-5" />}
          iconBadgeClass="icon-badge-warning"
          title="Disable this country's financial configuration?"
          description="A reversible pause. Existing records are preserved; new collections and payouts are blocked until it's re-activated."
          confirmLabel="Disable"
          variant="destructive"
          reason={{ label: "Reason", placeholder: "Why is this being disabled?" }}
          onConfirm={(reason) => post("suspend", { reason })}
        />
      )}

      {!isArchived && (
        <ConfirmActionDialog
          trigger={
            <Button size="sm" variant="outline" className="gap-1.5 rounded-full text-destructive border-destructive/30">
              <Archive className="h-4 w-4" /> Archive
            </Button>
          }
          icon={<Archive className="h-5 w-5" />}
          iconBadgeClass="icon-badge-danger"
          title="Archive this country's financial configuration?"
          description="For decommissioning finance in this country. Records are kept for audit; it can be restored to a draft later. Use Disable for a temporary pause."
          confirmLabel="Archive"
          variant="destructive"
          onConfirm={() => post("disable")}
        />
      )}

      {isArchived && (
        <ConfirmActionDialog
          trigger={<Button size="sm" variant="outline" className="gap-1.5 rounded-full"><RotateCcw className="h-4 w-4" /> Restore</Button>}
          icon={<RotateCcw className="h-5 w-5" />}
          title="Restore this financial configuration?"
          description="It comes back as a draft and must be re-activated (currency + primary provider account re-validated) before the country can operate financially."
          confirmLabel="Restore"
          onConfirm={() => post("restore")}
        />
      )}
    </div>
  )
}
