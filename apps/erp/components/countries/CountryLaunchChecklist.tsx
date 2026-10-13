import { CheckCircle2, XCircle } from "lucide-react"

interface Props {
  vendorTypeCount           : number
  documentTypeCount         : number
  outboundPaymentMethodCount: number
  cityCount                 : number
  readyToActivate           : boolean
  status                    : string
  countrySlug               : string
  /** ISO 4217 code — always present (a required, non-nullable Country column, populated for every row by the geography seed). Shown for visibility parity with the other checklist items (CLAUDE.md), NOT as a gate — there's no state where it could ever be missing. */
  currency                  : string
  currencySymbol?           : string | null
}

/**
 * Pre-activation checklist — a country needs at least one vendor type, one
 * document type, one vendor payout method, and one city before it can go
 * ACTIVE (see activateCountry in admin.country.service.ts). Shown even once
 * active, as a record of what unlocked activation. All four rows link to
 * real country sub-pages (Countries + Finance IA restructuring fixed the
 * vendor-types/document-types rows, which previously pointed at `#` anchor
 * placeholders). The city row is deliberately just presence, not
 * boundary/service-area configuration — that's ongoing operational map
 * work, not a launch gate (see admin.country.service.ts's comment).
 *
 * Currency is shown separately, below the four-item grid, not as a fifth
 * gated item — it's a required DB column populated at seed time for every
 * country, so it can never actually be "missing" the way the other four
 * can; this is purely visibility (CLAUDE.md's Finance-domain currency note).
 */
export function CountryLaunchChecklist({ vendorTypeCount, documentTypeCount, outboundPaymentMethodCount, cityCount, readyToActivate, status, countrySlug, currency, currencySymbol }: Props) {
  const rows = [
    { label: "Vendor types linked",    count: vendorTypeCount,            href: `/countries/${countrySlug}/vendor-categories` },
    { label: "Document types created", count: documentTypeCount,         href: `/countries/${countrySlug}/documents` },
    { label: "Vendor payout methods configured", count: outboundPaymentMethodCount, href: `/countries/${countrySlug}/payment-methods` },
    { label: "Cities added",           count: cityCount,                 href: `/countries/${countrySlug}/cities` },
  ]

  return (
    <div className="admin-card space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Launch Checklist</h2>
        <p className="text-xs text-muted-foreground">
          {status === "ACTIVE"
            ? "What unlocked activation for this country."
            : readyToActivate
              ? "Requirements met — this country can now be activated."
              : "All four are required before this country can be activated."}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((row) => {
          const done = row.count > 0
          return (
            <a
              key={row.label}
              href={row.href}
              className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 px-3.5 py-3 transition-colors hover:bg-muted/30"
            >
              <div className="flex items-center gap-2.5">
                {done
                  ? <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                  : <XCircle className="h-4 w-4 shrink-0 text-muted-foreground" />}
                <span className="text-sm text-foreground">{row.label}</span>
              </div>
              <span className="text-sm font-medium tabular-nums text-foreground">{row.count}</span>
            </a>
          )
        })}
      </div>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/20 px-3.5 py-3">
        <div className="flex items-center gap-2.5">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
          <span className="text-sm text-foreground">Currency</span>
        </div>
        <span className="text-sm font-medium text-foreground">
          {currency}{currencySymbol ? ` (${currencySymbol})` : ""}
        </span>
      </div>
    </div>
  )
}
