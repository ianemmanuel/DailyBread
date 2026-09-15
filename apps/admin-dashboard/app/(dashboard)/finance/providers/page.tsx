import type { Metadata } from "next"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Plug, ShieldAlert } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { adminFetch } from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import { EmptyState } from "@/components/shared/EmptyState"
import { PaymentProviderFormSheet } from "@/components/finance/PaymentProviderFormSheet"
import { PaymentProviderStatusToggle } from "@/components/finance/PaymentProviderStatusToggle"
import { AdminPermissions } from "@repo/types/admin-app"
import type { PaymentProviderListResult } from "@repo/types/admin-app"

export const metadata: Metadata = { title: "Payment Providers" }
export const revalidate = 60

/*
 * Finance Phase 1A — the PaymentProvider CATALOG: the platform's declared
 * knowledge of which provider implementations exist (Flutterwave, Stripe,
 * …) and what each is expected to be able to do. NOT credentials, NOT
 * per-country wiring — those are later phases.
 *
 * Gated on finance:configuration:read. Every mutation additionally
 * requires GLOBAL scope (backend assertGlobalFinanceScope) — a
 * country-scoped finance admin can view this but never gets action
 * buttons, same convention as /payment-gateways.
 */
export default async function PaymentProvidersPage() {
  const session = await getAdminSession()
  if (!session.permissions.includes(AdminPermissions.FINANCE_CONFIGURATION_READ)) redirect("/overview")

  const canManage =
    session.scope.isGlobal && session.permissions.includes(AdminPermissions.FINANCE_CONFIGURATION_MANAGE)

  const result = await adminFetch<PaymentProviderListResult>("/admin/v1/finance/providers?pageSize=100", {
    next: { revalidate: 60, tags: ["finance-providers"] },
  }).catch(() => null)

  const providers = result?.providers ?? []

  return (
    <div className="page-content animate-slide-up">
      <Link
        href="/finance"
        className="group inline-flex w-fit items-center gap-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card shadow-[var(--shadow-xs)] transition-all group-hover:-translate-x-0.5 group-hover:border-primary/40 group-hover:text-primary">
          <ArrowLeft className="h-4 w-4" />
        </span>
        Back to Finance
      </Link>

      <div className="admin-card flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="icon-badge icon-badge-primary h-12 w-12">
            <Plug className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Payment Providers</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              The catalog of provider implementations the platform can be wired to. Connecting one to a country happens
              in a later step.
            </p>
          </div>
        </div>
        {canManage && <PaymentProviderFormSheet />}
      </div>

      {!session.scope.isGlobal && (
        <div className="admin-card flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            You&apos;re viewing the global payment-provider catalog. Changing it requires a globally-scoped finance admin.
          </p>
        </div>
      )}

      {providers.length === 0 ? (
        <EmptyState
          icon={Plug}
          title="No payment providers"
          description="Nothing has been added to the provider catalog yet."
        />
      ) : (
        <div className="admin-card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="text-xs uppercase tracking-wide">Provider</TableHead>
                  <TableHead className="hidden text-xs uppercase tracking-wide md:table-cell">Capabilities</TableHead>
                  <TableHead className="hidden text-xs uppercase tracking-wide lg:table-cell">Currencies</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide">Status</TableHead>
                  {canManage && <TableHead className="text-right text-xs uppercase tracking-wide">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {providers.map((p) => (
                  <TableRow key={p.id} className="hover:bg-muted/10 align-top">
                    <TableCell>
                      <p className="font-medium text-foreground">{p.name}</p>
                      <p className="font-mono text-xs text-muted-foreground">{p.code}</p>
                      {p.description && <p className="mt-1 max-w-sm text-xs text-muted-foreground">{p.description}</p>}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="flex max-w-xs flex-wrap gap-1">
                        {p.capabilities.map((c) => (
                          <span key={c} className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                            {c.replace(/_/g, " ").toLowerCase()}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                      {p.supportedCurrencies.length ? p.supportedCurrencies.join(", ") : "—"}
                    </TableCell>
                    <TableCell>
                      <span className={p.status === "ACTIVE" ? "badge-success" : "badge-neutral"}>
                        {p.status === "ACTIVE" ? "Active" : "Inactive"}
                      </span>
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          <PaymentProviderFormSheet provider={p} />
                          <PaymentProviderStatusToggle code={p.code} name={p.name} status={p.status} />
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  )
}
