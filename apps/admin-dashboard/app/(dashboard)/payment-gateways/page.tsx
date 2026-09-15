import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { CreditCard, ArrowDownToLine, ArrowUpFromLine } from "lucide-react"
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
import { TableFilterBar, type FilterStatusOption } from "@/components/shared/TableFilterBar"
import { TablePagination } from "@/components/shared/TablePagination"
import { EmptyState } from "@/components/shared/EmptyState"
import { PaymentMethodFormSheet } from "@/components/payment-methods/PaymentMethodFormSheet"
import { PaymentMethodActiveToggle } from "@/components/payment-methods/PaymentMethodActiveToggle"
import { AdminPermissions } from "@repo/types/admin-app"
import type { PaymentMethodListResult, PaymentMethodType } from "@/types"

export const metadata: Metadata = { title: "Payment Gateways" }
export const revalidate = 60

const PAGE_SIZE = 20

interface PageProps {
  searchParams: Promise<{ page?: string; search?: string; status?: string }>
}

const STATUS_OPTIONS: FilterStatusOption[] = [
  { value: "true",  label: "Active",   dot: "bg-success" },
  { value: "false", label: "Inactive", dot: "bg-muted-foreground/40" },
]

const TYPE_LABEL: Record<PaymentMethodType, string> = {
  MOBILE_MONEY: "Mobile Money", BANK: "Bank", DIGITAL_WALLET: "Digital Wallet", CARD: "Card",
}

export default async function PaymentGatewaysPage({ searchParams }: PageProps) {
  const session = await getAdminSession()

  if (!session.permissions.includes(AdminPermissions.FINANCE_PAYMENT_METHODS_READ)) redirect("/overview")

  // Every mutation requires global scope regardless of permission — see
  // admin.paymentMethod.service.ts's assertGlobalScope. A country-scoped
  // finance/operations_admin can read this page but never gets action buttons.
  const canManage = session.scope.isGlobal && session.permissions.includes(AdminPermissions.FINANCE_PAYMENT_METHODS_MANAGE)

  const params  = await searchParams
  const page    = params.page   ?? "1"
  const search  = params.search ?? ""
  const status  = params.status ?? ""

  const qs = new URLSearchParams({
    page, pageSize: String(PAGE_SIZE),
    ...(search ? { search } : {}),
    ...(status && status !== "all" ? { isActive: status } : {}),
  })

  const result = await adminFetch<PaymentMethodListResult>(`/admin/v1/payment-methods?${qs}`, {
    next: { revalidate: 60, tags: ["payment-methods"] },
  }).catch(() => null)

  return (
    <div className="page-content animate-slide-up">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="icon-badge icon-badge-primary h-10 w-10">
            <CreditCard className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Payment Gateways</h1>
            <p className="text-sm text-muted-foreground">
              The platform-wide catalog of payment methods. Activating one for a specific country happens on that country's page.
            </p>
          </div>
        </div>
        {canManage && <PaymentMethodFormSheet />}
      </div>

      <TableFilterBar
        searchPlaceholder="Search by name…"
        defaultSearch={search}
        statusLabel="Status"
        statusOptions={STATUS_OPTIONS}
        defaultStatus={status}
      />

      {!result || result.methods.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="No payment methods"
          description="Nothing matches these filters, or none have been created yet."
        />
      ) : (
        <div className="admin-card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="text-xs uppercase tracking-wide">Method</TableHead>
                  <TableHead className="hidden text-xs uppercase tracking-wide sm:table-cell">Type</TableHead>
                  <TableHead className="hidden text-xs uppercase tracking-wide md:table-cell">Direction</TableHead>
                  <TableHead className="hidden text-xs uppercase tracking-wide lg:table-cell">Countries Configured</TableHead>
                  <TableHead className="hidden text-xs uppercase tracking-wide sm:table-cell">Status</TableHead>
                  {canManage && <TableHead className="text-right text-xs uppercase tracking-wide">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.methods.map((m) => (
                  <TableRow key={m.id} className="hover:bg-muted/10">
                    <TableCell>
                      <p className="font-medium text-foreground">{m.name}</p>
                      <p className="font-mono text-xs text-muted-foreground">{m.code}</p>
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">{TYPE_LABEL[m.type]}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="flex items-center gap-1.5">
                        {m.direction.includes("INBOUND") && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-info-bg px-2 py-0.5 text-xs font-medium text-info">
                            <ArrowDownToLine className="h-3 w-3" /> Inbound
                          </span>
                        )}
                        {m.direction.includes("OUTBOUND") && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-warning-bg px-2 py-0.5 text-xs font-medium text-warning">
                            <ArrowUpFromLine className="h-3 w-3" /> Outbound
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">{m.countryConfigCount ?? 0}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <span className={m.isActive ? "badge-success" : "badge-neutral"}>{m.isActive ? "Active" : "Inactive"}</span>
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          <PaymentMethodFormSheet paymentMethod={m} />
                          <PaymentMethodActiveToggle code={m.code} name={m.name} isActive={m.isActive} />
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

      {result && (
        <TablePagination
          total={result.total}
          page={result.page}
          totalPages={result.totalPages}
          basePath="/payment-gateways"
          params={{ ...(search ? { search } : {}), ...(status ? { status } : {}) }}
          itemLabel="payment methods"
        />
      )}
    </div>
  )
}
