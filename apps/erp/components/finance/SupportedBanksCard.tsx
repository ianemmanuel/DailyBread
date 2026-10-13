"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Loader2, Landmark, Building2, CheckCircle2, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  PaymentProviderCapability,
  type CountryProviderAccount,
  type PaymentProvider,
  type ProviderBankListTestResult,
} from "@repo/types/admin-app"

interface Props {
  accounts: CountryProviderAccount[]
  providers: PaymentProvider[]
  bankVerificationAccountId: string | null
}

/*
 * "Supported banks" — the banks a vendor in this country can pick as an
 * OUTBOUND bank-payout destination. The list comes from the country's
 * bank-verification provider account's own bank directory (Finance's
 * BANK_LIST capability), NOT from anything we store — so it also doubles as
 * a live connectivity check for that provider account.
 *
 * Fetched ON DEMAND only (the "View supported banks" button) — never during
 * SSR / render, and never polled. The provider-layer 6-hour cache still
 * applies underneath. Country + environment are derived server-side from the
 * provider account; nothing here supplies them. Only the normalized
 * { name, code } is shown — no provider-internal identifiers.
 */
export function SupportedBanksCard({ accounts, providers, bankVerificationAccountId }: Props) {
  const testable = useMemo(() => {
    const withBankList = new Set(
      providers.filter((p) => p.capabilities.includes(PaymentProviderCapability.BANK_LIST)).map((p) => p.id),
    )
    return accounts.filter((a) => a.status !== "DISABLED" && withBankList.has(a.paymentProviderId))
  }, [accounts, providers])

  const [accountId, setAccountId] = useState(
    () => (bankVerificationAccountId && testable.some((a) => a.id === bankVerificationAccountId)
      ? bankVerificationAccountId
      : testable[0]?.id ?? ""),
  )
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ProviderBankListTestResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const Header = () => (
    <div className="flex items-center gap-2">
      <div className="icon-badge icon-badge-primary h-8 w-8"><Landmark className="h-4 w-4" /></div>
      <div>
        <h2 className="text-sm font-semibold text-foreground">Supported banks</h2>
        <p className="text-[11px] text-muted-foreground">Banks a vendor can be paid out to in this country (outbound bank payouts)</p>
      </div>
    </div>
  )

  if (testable.length === 0) {
    return (
      <div className="admin-card space-y-2">
        <Header />
        <p className="text-xs text-muted-foreground">
          The list is fetched live from the country&apos;s bank-verification provider when you configure one — it&apos;s the exact
          set of banks your vendors will choose from when adding a bank payout account. No provider account with a
          bank directory is configured for this country yet.
        </p>
      </div>
    )
  }

  async function loadBanks() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/finance/provider-accounts/${accountId}/test-bank-list`, { method: "POST" })
      const json = await res.json().catch(() => ({}))
      if (res.ok) {
        setResult(json?.data ?? null)
      } else {
        setResult(null)
        setError(json?.message ?? "Couldn't reach the provider")
        toast.error(json?.message ?? "Couldn't reach the provider")
      }
    } catch {
      setError("Network error")
      toast.error("Network error")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="admin-card space-y-3">
      <Header />
      <p className="text-xs text-muted-foreground">
        Retrieved live from the selected provider account using its resolved credentials — this also confirms the integration
        works before you activate. Configures nothing.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {testable.length > 1 && (
          <Select value={accountId} onValueChange={(v) => { setAccountId(v); setResult(null); setError(null) }}>
            <SelectTrigger className="w-64 rounded-xl text-sm"><SelectValue /></SelectTrigger>
            <SelectContent className="rounded-xl">
              {testable.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.paymentProvider?.name ?? a.paymentProviderId} · {a.environment} · {a.status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button size="sm" variant="outline" className="gap-1.5 rounded-full" disabled={!accountId || busy} onClick={loadBanks}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronDown className="h-4 w-4" />}
          {result ? "Refresh list" : "View supported banks"}
        </Button>
      </div>

      {error && <p className="text-xs text-warning">{error}</p>}

      {result && (
        <div className="space-y-2 rounded-xl border border-border/60 bg-muted/20 p-3">
          <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-foreground">
            <CheckCircle2 className="h-4 w-4 text-success" />
            {result.count} bank{result.count === 1 ? "" : "s"} supported
            <span className="text-xs font-normal text-muted-foreground">
              · {result.provider} · {result.environment} · {result.countryCode}
            </span>
          </p>
          {result.banks.length > 0 ? (
            <ul className="max-h-56 space-y-1 overflow-y-auto">
              {result.banks.map((b) => (
                <li key={b.code} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2 text-foreground">
                    <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{b.name}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{b.code}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">The provider returned no banks for this country.</p>
          )}
        </div>
      )}
    </div>
  )
}
