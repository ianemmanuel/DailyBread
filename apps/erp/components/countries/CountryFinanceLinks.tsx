import Link from "next/link"
import { Landmark, CreditCard, CheckCircle2, XCircle, ChevronRight } from "lucide-react"

interface Props {
  countrySlug: string
  financiallyReady: boolean
  outboundPaymentMethodCount: number
  inboundPaymentMethodCount: number
}

/**
 * Hub links into the two dedicated finance configuration surfaces — never
 * duplicates their forms here (see Countries + Finance IA restructuring).
 * Financial Configuration (provider account/collections/payouts/wiring) and
 * Payment Methods (which CountryPaymentMethod rows are enabled) are
 * deliberately separate pages with their own permissions; this card only
 * connects them from the Country Command Center.
 */
export function CountryFinanceLinks({
  countrySlug, financiallyReady, outboundPaymentMethodCount, inboundPaymentMethodCount,
}: Props) {
  const methodCount = outboundPaymentMethodCount + inboundPaymentMethodCount

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Link
        href={`/countries/${countrySlug}/finance`}
        className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 px-3.5 py-3 transition-colors hover:bg-muted/30"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="icon-badge icon-badge-primary h-9 w-9 shrink-0">
            <Landmark className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Financial Configuration</p>
            <p className="truncate text-xs text-muted-foreground">Currency, provider account, collections &amp; payouts</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {financiallyReady
            ? <CheckCircle2 className="h-4 w-4 text-success" />
            : <XCircle className="h-4 w-4 text-muted-foreground" />}
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      </Link>

      <Link
        href={`/countries/${countrySlug}/payment-methods`}
        className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 px-3.5 py-3 transition-colors hover:bg-muted/30"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="icon-badge icon-badge-primary h-9 w-9 shrink-0">
            <CreditCard className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">Payment Methods</p>
            <p className="truncate text-xs text-muted-foreground">
              {methodCount > 0 ? `${methodCount} method${methodCount === 1 ? "" : "s"} configured` : "Not configured yet"}
            </p>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Link>
    </div>
  )
}
