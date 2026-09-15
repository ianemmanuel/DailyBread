"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Loader2, CheckCircle2, XCircle, ShieldCheck, Landmark, Wallet, ArrowDownToLine, ArrowUpFromLine,
  Plus, Plug, PlugZap,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  BUSINESS_PROVIDER_CAPABILITIES,
  INTEGRATION_PROVIDER_CAPABILITIES,
  FINANCIAL_READINESS_REASON_LABELS,
  PaymentProviderCapability,
  type CountryFinancialConfigView,
  type CountryProviderAccount,
  type CountryPaymentMethodWithProvider,
  type ProviderGatewayStatus,
  type PaymentProvider,
  type ReadinessCheck,
} from "@repo/types/admin-app"
import { SupportedBanksCard } from "./SupportedBanksCard"
import { ProviderAccountActions } from "./ProviderAccountActions"
import { ConfigLifecycleActions } from "./ConfigLifecycleActions"
import { PROVIDER_ACCOUNT_STATUS_LABEL, PROVIDER_ACCOUNT_STATUS_BADGE } from "./provider-account-status"

interface Props {
  countrySlug: string
  countryName: string
  countryStatus: string
  view: CountryFinancialConfigView
  providers: PaymentProvider[]
}

const CAP_LABEL = (c: string) => c.replace(/_/g, " ").toLowerCase()

const INTEGRATION_CAP_LABEL: Record<string, string> = {
  WEBHOOKS: "Webhook processing",
  BANK_LIST: "Bank directory",
  BANK_ACCOUNT_RESOLUTION: "Bank account verification",
}
const INTEGRATION_CAP_SET = new Set<string>(INTEGRATION_PROVIDER_CAPABILITIES)

// Config-level status vocabulary (same shape as a provider account:
// DRAFT / ACTIVE / SUSPENDED→Disabled / DISABLED→Archived).
const CONFIG_STATUS_LABEL: Record<string, string> = {
  NONE: "Not created", DRAFT: "Draft", ACTIVE: "Active", SUSPENDED: "Disabled", DISABLED: "Archived",
}
const CONFIG_STATUS_BADGE: Record<string, string> = {
  DRAFT: "badge-neutral", ACTIVE: "badge-success", SUSPENDED: "badge-warning", DISABLED: "badge-neutral",
}

export function CountryFinancialConfigManager({
  countrySlug, countryName, countryStatus, view, providers,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)

  const { config, providerAccounts, readiness, providerGateway, paymentMethods, countryCurrency, canManageDraft, canManageLifecycle } = view
  const configStatus = config?.status ?? "NONE"

  async function call(url: string, method: "POST" | "PATCH", body?: unknown, key = url) {
    setBusy(key)
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success(data.message ?? "Done")
        startTransition(() => router.refresh())
      } else if (res.status === 404) {
        // The row this action targeted no longer exists (e.g. a payment
        // method removed on the Payment Methods page while this view was
        // cached). Resync rather than leaving a dead row on screen.
        toast.error(data.message ?? "That item no longer exists — refreshing.")
        startTransition(() => router.refresh())
      } else {
        toast.error(data.message ?? "Action failed")
      }
      return res.ok
    } catch {
      toast.error("Network error")
      return false
    } finally {
      setBusy(null)
    }
  }

  const base = `/api/finance/countries/${countrySlug}/financial-config`
  const isBusy = (k: string) => busy === k || pending

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="admin-card flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="icon-badge icon-badge-primary h-12 w-12"><Landmark className="h-5 w-5" /></div>
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">{countryName} — Finance</h1>
            <p className="mt-0.5 flex items-center gap-2 text-sm text-muted-foreground">
              Config status: <span className={CONFIG_STATUS_BADGE[configStatus] ?? "badge-neutral"}>{CONFIG_STATUS_LABEL[configStatus] ?? configStatus}</span>
              <span className="text-xs">· country is {countryStatus}</span>
            </p>
          </div>
        </div>
        {config && (
          <ConfigLifecycleActions
            countrySlug={countrySlug}
            configStatus={configStatus}
            canManageLifecycle={canManageLifecycle}
          />
        )}
      </div>

      {/* No config yet */}
      {!config && (
        <div className="admin-card flex flex-col items-start gap-3">
          <p className="text-sm text-muted-foreground">
            This country has no financial configuration yet.
          </p>
          {canManageDraft ? (
            <Button size="sm" className="gap-1.5 rounded-full" disabled={isBusy("create")}
              onClick={() => call(base, "POST", undefined, "create")}>
              {isBusy("create") ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Create financial configuration (DRAFT)
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">You don&apos;t have permission to create it.</p>
          )}
        </div>
      )}

      {config && (
        <>
          {/* Readiness */}
          <div className="admin-card space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">Financial readiness</h2>
              <span className={readiness.financiallyReady ? "badge-success" : "badge-warning"}>
                {readiness.financiallyReady ? "Ready" : "Not ready"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              A country cannot be activated until it is financially ready — collection <em>and</em> payout.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <ReadinessBox title="Collections" icon={ArrowDownToLine} check={readiness.collection} />
              <ReadinessBox title="Payouts" icon={ArrowUpFromLine} check={readiness.payout} />
              <ReadinessBox title="Bank verification" icon={ShieldCheck} check={readiness.bankVerification} />
            </div>
            <ProviderGatewayRow gateway={providerGateway} />
          </div>

          {/* Currency — read-only, owned by the country; per-provider support shown on each account */}
          <CurrencyCard config={config} countryCurrency={countryCurrency} />

          {/* Provider accounts */}
          <ProviderAccountsSection
            countrySlug={countrySlug}
            accounts={providerAccounts}
            providers={providers}
            bankVerificationAccountId={config.bankVerificationProviderAccountId}
            configStatus={configStatus}
            canManageDraft={canManageDraft}
            canManageLifecycle={canManageLifecycle}
            call={call}
            isBusy={isBusy}
          />

          {/* Supported banks — the bank-payout destinations vendors pick from;
              fetched on demand from the bank-verification provider account */}
          <SupportedBanksCard
            accounts={providerAccounts}
            providers={providers}
            bankVerificationAccountId={config.bankVerificationProviderAccountId}
          />

          {/* Payment method ↔ provider account wiring (Phase 1C) */}
          <PaymentMethodWiringSection
            countrySlug={countrySlug}
            methods={paymentMethods}
            accounts={providerAccounts}
            canManage={canManageDraft}
            configDisabled={configStatus === "DISABLED"}
            call={call}
            isBusy={isBusy}
          />

          {/*
            How this country verifies vendor bank payout accounts. Separate
            from the routing binding above: that says WHO verifies, this says
            whether an automated verifier is expected at all.

            MANUAL exists because some markets have no payment provider that
            can resolve a bank account (Kenya/KES — confirmed against dLocal,
            Flutterwave, Paystack and Fincra). There, the vendor uploads a
            proof document and an admin verifies it by hand, exactly as
            marketplaces operating in those markets do. Readiness treats it
            as a legitimate operating mode, not a gap.

            The two paths never mix — a PROVIDER country never asks for a
            document, a MANUAL country never calls a provider.
          */}
          <div className="admin-card space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Bank-account verification</h2>
            <p className="text-xs text-muted-foreground">
              How vendors&apos; bank payout accounts are verified in this country. Switch to manual only where no
              payment provider can resolve a bank account — vendors then upload proof of ownership for an admin to
              review. Automatic requires a bank-verification provider account to be bound above.
            </p>
            <div className="flex flex-wrap gap-2">
              {(["PROVIDER", "MANUAL"] as const).map((mode) => {
                const active = config.bankVerificationMode === mode
                return (
                  <button
                    key={mode}
                    type="button"
                    disabled={!canManageDraft || configStatus === "DISABLED" || isBusy("verification-mode") || active}
                    onClick={() => call(`${base}/bank-verification-mode`, "PATCH", { mode }, "verification-mode")}
                    className={
                      active
                        // The active mode is its own state, not a target — a
                        // pointer there would promise an action that does nothing.
                        ? "cursor-default rounded-md border border-primary bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary"
                        : "cursor-pointer rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                    }
                  >
                    {mode === "PROVIDER" ? "Automatic (provider)" : "Manual (document review)"}
                  </button>
                )
              })}
            </div>
            {config.bankVerificationMode === "MANUAL" && (
              <p className="text-xs text-muted-foreground">
                Configure a <span className="font-medium">payout-account</span> scoped document type for this country
                so vendors know what to upload — otherwise accounts still go to manual review, just without a document.
              </p>
            )}
          </div>

          {/* Operational switches */}
          <div className="admin-card space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Operational switches</h2>
            <p className="text-xs text-muted-foreground">
              Deliberate &quot;we are collecting / paying out here&quot; decisions. Require at least one active provider
              account for this country that enables the matching capability; full routing is checked at country activation.
            </p>
            <SwitchRow
              label="Collections enabled"
              hint="Customer payments"
              checked={config.collectionsEnabled}
              disabled={!canManageDraft || configStatus === "DISABLED" || isBusy("switches")}
              onChange={(v) => call(`${base}/switches`, "PATCH", { collectionsEnabled: v }, "switches")}
            />
            <SwitchRow
              label="Payouts enabled"
              hint="Vendor payouts"
              checked={config.payoutsEnabled}
              disabled={!canManageDraft || configStatus === "DISABLED" || isBusy("switches")}
              onChange={(v) => call(`${base}/switches`, "PATCH", { payoutsEnabled: v }, "switches")}
            />
          </div>
        </>
      )}
    </div>
  )
}

function ReadinessBox({ title, icon: Icon, check }: { title: string; icon: typeof ShieldCheck; check: ReadinessCheck }) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-semibold text-foreground">{title}</span>
        {check.ready
          ? <CheckCircle2 className="ml-auto h-4 w-4 text-success" />
          : <XCircle className="ml-auto h-4 w-4 text-warning" />}
      </div>
      {!check.ready && (
        <ul className="mt-2 space-y-1">
          {check.reasons.map((r) => (
            <li key={r} className="text-[11px] leading-tight text-muted-foreground">• {FINANCIAL_READINESS_REASON_LABELS[r]}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function CurrencyCard({
  config, countryCurrency,
}: {
  config: NonNullable<CountryFinancialConfigView["config"]>
  countryCurrency: string
}) {
  const resolved = config.currency ?? null

  return (
    <div className="admin-card space-y-2">
      <div className="flex items-center gap-2">
        <Wallet className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">Currency</h2>
        {resolved
          ? <span className="badge-success">{resolved.code}</span>
          : <span className="badge-warning">not recognised</span>}
      </div>
      {resolved ? (
        <p className="text-sm text-foreground">
          {resolved.code} — {resolved.name}
          {resolved.symbol ? <span className="text-muted-foreground"> ({resolved.symbol})</span> : null}
        </p>
      ) : (
        <p className="text-sm text-warning">
          This country&apos;s currency (<span className="font-mono">{countryCurrency}</span>) isn&apos;t in the
          finance currency reference table yet — add it under Finance → Currencies before activating.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Automatically determined from the country&apos;s configuration. To change it, update the country&apos;s currency.
        Each provider account below shows whether its provider supports this currency.
      </p>
    </div>
  )
}

function ProviderGatewayRow({ gateway }: { gateway: ProviderGatewayStatus }) {
  if (!gateway.configured) return null
  const Dot = ({ ok }: { ok: boolean }) =>
    ok ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : <XCircle className="h-3.5 w-3.5 text-warning" />
  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
      <div className="flex items-center gap-2">
        {gateway.blockers.length === 0 ? <PlugZap className="h-4 w-4 text-success" /> : <Plug className="h-4 w-4 text-warning" />}
        <span className="text-xs font-semibold text-foreground">Bank-verification integration</span>
        <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-mono">
          {gateway.providerCode} · {gateway.environment}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1"><Dot ok={gateway.adapterRegistered} /> adapter registered</span>
        <span className="flex items-center gap-1"><Dot ok={gateway.credentialsResolvable} /> credentials resolvable</span>
      </div>
      {gateway.blockers.length > 0 && (
        <p className="mt-1.5 text-[11px] text-warning">
          Blockers: {gateway.blockers.map((b) => b.replace(/_/g, " ").toLowerCase()).join(", ")}
        </p>
      )}
    </div>
  )
}

function PaymentMethodWiringSection({
  countrySlug, methods, accounts, canManage, configDisabled, call, isBusy,
}: {
  countrySlug: string
  methods: CountryPaymentMethodWithProvider[]
  accounts: CountryProviderAccount[]
  canManage: boolean
  configDisabled: boolean
  call: (url: string, method: "POST" | "PATCH", body?: unknown, key?: string) => Promise<boolean>
  isBusy: (k: string) => boolean
}) {
  const NONE = "__none__"
  return (
    <div className="admin-card space-y-3">
      <h2 className="text-sm font-semibold text-foreground">Payment provider assignment</h2>
      <p className="text-xs text-muted-foreground">
        Which provider account <strong>executes</strong> each payment method this country offers — money <strong>in</strong>{" "}
        from customers (inbound) and money <strong>out</strong> to vendors (outbound). The methods themselves are turned
        on/off on the country&apos;s Payment Methods page; this is where each is bound to the credentialed account that
        moves the money. A method only counts toward readiness once it&apos;s assigned to an account that enables the
        matching capability.
      </p>
      {methods.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No payment methods configured for this country yet — add them on the country&apos;s Payment Methods page.
        </p>
      ) : (
        <ul className="divide-y divide-border/60">
          {methods.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm text-foreground">
                  {m.direction === "INBOUND"
                    ? <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><ArrowDownToLine className="h-3.5 w-3.5" />Inbound</span>
                    : <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><ArrowUpFromLine className="h-3.5 w-3.5" />Outbound</span>}
                  {m.paymentMethod.name}
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{m.paymentMethod.type}</span>
                  {m.status !== "ACTIVE" && <span className="badge-neutral">{m.status}</span>}
                </p>
                {m.countryProviderAccount && (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    via {m.countryProviderAccount.paymentProvider.name} ({m.countryProviderAccount.environment}) ·
                    {" "}{m.countryProviderAccount.status}
                  </p>
                )}
              </div>
              {canManage && !configDisabled ? (
                <Select
                  value={m.countryProviderAccountId ?? NONE}
                  onValueChange={(v) =>
                    call(
                      `/api/finance/countries/${countrySlug}/payment-methods/${m.id}/provider-account`,
                      "PATCH",
                      { countryProviderAccountId: v === NONE ? null : v },
                      `wire-${m.id}`,
                    )
                  }
                >
                  <SelectTrigger className="w-56 rounded-xl text-sm">
                    <SelectValue placeholder="Not wired" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value={NONE}>Not wired</SelectItem>
                    {accounts
                      .filter((a) => a.status !== "DISABLED")
                      .map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.paymentProvider?.name ?? a.paymentProviderId} · {a.environment} · {a.status}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              ) : (
                <span className="text-xs text-muted-foreground">
                  {m.countryProviderAccountId ? "wired" : "not wired"}
                </span>
              )}
              {isBusy(`wire-${m.id}`) && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function SwitchRow({ label, hint, checked, disabled, onChange }: {
  label: string; hint: string; checked: boolean; disabled: boolean; onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-3.5 py-2.5">
      <span>
        <span className="block text-sm text-foreground">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </label>
  )
}

function ProviderAccountsSection({
  countrySlug, accounts, providers, bankVerificationAccountId, configStatus, canManageDraft, canManageLifecycle, call, isBusy,
}: {
  countrySlug: string
  accounts: CountryProviderAccount[]
  providers: PaymentProvider[]
  bankVerificationAccountId: string | null
  configStatus: string
  canManageDraft: boolean
  canManageLifecycle: boolean
  call: (url: string, method: "POST" | "PATCH", body?: unknown, key?: string) => Promise<boolean>
  isBusy: (k: string) => boolean
}) {
  const [adding, setAdding] = useState(false)
  const [providerId, setProviderId] = useState("")
  const [environment, setEnvironment] = useState<"TEST" | "LIVE">("TEST")
  const [caps, setCaps] = useState<PaymentProviderCapability[]>([])

  const selectedProvider = providers.find((p) => p.id === providerId)
  const providerCaps = new Set(selectedProvider?.capabilities ?? [])
  // The admin only ever picks BUSINESS capabilities the provider supports.
  const businessCaps = BUSINESS_PROVIDER_CAPABILITIES.filter((c) => !selectedProvider || providerCaps.has(c))
  // Integration capabilities are shown read-only — they come from the adapter.
  const integrationCaps = selectedProvider
    ? INTEGRATION_PROVIDER_CAPABILITIES.filter((c) => providerCaps.has(c))
    : []

  async function submitNew() {
    const ok = await call(`/api/finance/countries/${countrySlug}/provider-accounts`, "POST", {
      paymentProviderId: providerId,
      environment,
      enabledCapabilities: caps,
    }, "new-account")
    if (ok) { setAdding(false); setProviderId(""); setCaps([]) }
  }

  return (
    <div className="admin-card space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Provider accounts</h2>
          <p className="text-[11px] text-muted-foreground">
            A country can run several — one per capability. Collection/payout route per payment method (below);
            bank-account verification routes through the account marked here.
          </p>
        </div>
        {canManageDraft && configStatus !== "DISABLED" && (
          <Button size="sm" variant="outline" className="gap-1.5 rounded-full" onClick={() => setAdding((v) => !v)}>
            <Plus className="h-3.5 w-3.5" /> {adding ? "Cancel" : "Add account"}
          </Button>
        )}
      </div>

      {adding && (
        <div className="space-y-3 rounded-xl border border-border/60 bg-muted/20 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Provider</Label>
              <Select value={providerId} onValueChange={setProviderId}>
                <SelectTrigger className="rounded-xl text-sm"><SelectValue placeholder="Select provider" /></SelectTrigger>
                <SelectContent className="rounded-xl">
                  {providers.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Environment</Label>
              <Select value={environment} onValueChange={(v) => setEnvironment(v as "TEST" | "LIVE")}>
                <SelectTrigger className="rounded-xl text-sm"><SelectValue /></SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="TEST">TEST</SelectItem>
                  <SelectItem value="LIVE">LIVE</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Business capabilities this account handles</Label>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {businessCaps.map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm text-foreground">
                  <Checkbox
                    checked={caps.includes(c)}
                    onCheckedChange={() => setCaps((p) => p.includes(c) ? p.filter((x) => x !== c) : [...p, c])}
                  />
                  {CAP_LABEL(c)}
                </label>
              ))}
            </div>
          </div>
          {selectedProvider && (
            <div className="space-y-1.5">
              <Label className="text-xs">Provider integration (automatic)</Label>
              {integrationCaps.length === 0 ? (
                <p className="text-xs text-muted-foreground">This provider declares no integration capabilities.</p>
              ) : (
                <div className="flex flex-wrap gap-x-4 gap-y-1">
                  {integrationCaps.map((c) => (
                    <span key={c} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                      {INTEGRATION_CAP_LABEL[c] ?? CAP_LABEL(c)}
                    </span>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">
                Webhooks, the bank directory and account verification come from the provider integration — not a choice.
              </p>
            </div>
          )}
          <Button size="sm" className="rounded-full" disabled={!providerId || caps.length === 0 || isBusy("new-account")} onClick={submitNew}>
            {isBusy("new-account") && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Create DRAFT account
          </Button>
        </div>
      )}

      {accounts.length === 0 ? (
        <p className="text-xs text-muted-foreground">No provider accounts yet.</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {accounts.map((a) => (
            <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                  {a.paymentProvider?.name ?? a.paymentProviderId}
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-mono">{a.environment}</span>
                  <span className={PROVIDER_ACCOUNT_STATUS_BADGE[a.status] ?? "badge-neutral"}>
                    {PROVIDER_ACCOUNT_STATUS_LABEL[a.status] ?? a.status}
                  </span>
                  {a.id === bankVerificationAccountId && (
                    <span className="badge-info inline-flex items-center gap-1"><ShieldCheck className="h-3 w-3" />bank verification</span>
                  )}
                  {a.currencySupported === false && (
                    <span className="badge-warning inline-flex items-center gap-1" title="This provider does not list the country's currency">
                      currency unsupported
                    </span>
                  )}
                </p>
                <p className="mt-1 flex flex-wrap gap-1">
                  {a.enabledCapabilities.filter((c) => !INTEGRATION_CAP_SET.has(c)).map((c) => (
                    <span key={c} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{CAP_LABEL(c)}</span>
                  ))}
                </p>
                {a.enabledCapabilities.some((c) => INTEGRATION_CAP_SET.has(c)) && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Integration: {a.enabledCapabilities.filter((c) => INTEGRATION_CAP_SET.has(c)).map((c) => INTEGRATION_CAP_LABEL[c] ?? CAP_LABEL(c)).join(" · ")}
                  </p>
                )}
                {a.status === "SUSPENDED" && a.suspensionReason && (
                  <p className="mt-1 text-xs text-warning">Disabled: {a.suspensionReason}</p>
                )}
              </div>
              <ProviderAccountActions
                countrySlug={countrySlug}
                account={{ id: a.id, status: a.status }}
                isBankVerificationAccount={a.id === bankVerificationAccountId}
                enablesBankVerification={a.enabledCapabilities.includes(PaymentProviderCapability.BANK_ACCOUNT_RESOLUTION)}
                configStatus={configStatus}
                canManageDraft={canManageDraft}
                canManageLifecycle={canManageLifecycle}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
