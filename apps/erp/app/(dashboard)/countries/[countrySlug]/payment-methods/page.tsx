import { BackButton } from "@/components/shared/BackButton"
import type { Metadata } from "next"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { CreditCard, ArrowDownToLine, ArrowUpFromLine } from "lucide-react"
import { adminFetch, ApiCallError } from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import { EmptyState } from "@/components/shared/EmptyState"
import { CountryPaymentMethodSheet } from "@/components/payment-methods/CountryPaymentMethodSheet"
import { CountryPaymentMethodStatusToggle } from "@/components/payment-methods/CountryPaymentMethodStatusToggle"
import { AdminPermissions } from "@repo/types/admin-app"
import type { Country } from "@repo/types/admin-app"
import type { CountryPaymentMethodConfig, PaymentMethod, PaymentMethodListResult } from "@/types"

export const revalidate = 60

interface Props { params: Promise<{ countrySlug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { countrySlug } = await params
  return { title: `Payment Methods — ${countrySlug}` }
}

export default async function CountryPaymentMethodsPage({ params }: Props) {
  const session = await getAdminSession()

  // Deliberately its own permission, distinct from SETTINGS_GEOGRAPHY_WRITE
  // (the gate every other /countries/[slug]/... page uses) — this is
  // finance/operations_admin territory, not geography config (see
  // admin.paymentMethod.service.ts). Read is scope-filtered (a country-
  // scoped finance admin sees their own country); every mutation still
  // requires GLOBAL scope regardless of permission.
  if (!session.permissions.includes(AdminPermissions.FINANCE_PAYMENT_METHODS_READ)) redirect("/overview")
  const canManage = session.scope.isGlobal && session.permissions.includes(AdminPermissions.FINANCE_PAYMENT_METHODS_MANAGE)

  const { countrySlug } = await params

  let country: Country
  try {
    country = await adminFetch<Country>(`/admin/v1/countries/${countrySlug}`, {
      next: { revalidate: 60, tags: [`country-${countrySlug}`] },
    })
  } catch (err) {
    if (err instanceof ApiCallError && err.status === 404) notFound()
    throw err
  }

  if (!session.scope.isGlobal && !session.scope.countryIds.includes(country.id)) redirect("/overview")

  const [configs, catalogResult] = await Promise.all([
    adminFetch<CountryPaymentMethodConfig[]>(`/admin/v1/payment-methods/countries/${countrySlug}`, {
      next: { revalidate: 60, tags: [`country-payment-methods-${country.id}`, "payment-methods"] },
    }).catch(() => [] as CountryPaymentMethodConfig[]),
    canManage
      ? adminFetch<PaymentMethodListResult>("/admin/v1/payment-methods?isActive=true&pageSize=100", {
          next: { revalidate: 300, tags: ["payment-methods"] },
        }).catch(() => null)
      : Promise.resolve(null),
  ])

  const catalog: PaymentMethod[] = catalogResult?.methods ?? []
  const inbound  = configs.filter((c) => c.direction === "INBOUND")
  const outbound = configs.filter((c) => c.direction === "OUTBOUND")

  return (
    <div className="page-content animate-slide-up">
      <BackButton href={`/countries/${country.slug}`}>Back to {country.name}</BackButton>

      <div className="admin-card flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="icon-badge icon-badge-primary h-12 w-12">
            <CreditCard className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">Payment Methods</h1>
            <p className="text-sm text-muted-foreground">
              Which methods {country.name} offers — inbound (customers pay with it) and outbound (vendors are paid
              out with it). The provider that runs each is wired on the{" "}
              <Link href={`/countries/${country.slug}/finance`} className="text-primary hover:underline">Finance</Link> page.
            </p>
          </div>
        </div>
        {canManage && <CountryPaymentMethodSheet countryId={country.id} methods={catalog} />}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <PaymentMethodDirectionCard
          direction="INBOUND"
          title="Inbound — Customer Payments"
          caption="Money coming into DailyBread"
          icon={ArrowDownToLine}
          configs={inbound}
          catalog={catalog}
          countryId={country.id}
          countrySlug={country.slug}
          canManage={canManage}
          emptyDescription="No customer payment method yet — customer operations can't be marked ready for this country until one exists."
        />
        <PaymentMethodDirectionCard
          direction="OUTBOUND"
          title="Outbound — Vendor Payouts"
          caption="Money leaving DailyBread"
          icon={ArrowUpFromLine}
          configs={outbound}
          catalog={catalog}
          countryId={country.id}
          countrySlug={country.slug}
          canManage={canManage}
          emptyDescription="No vendor payout method yet — vendor onboarding can't be marked ready for this country until one exists."
        />
      </div>
    </div>
  )
}

function PaymentMethodDirectionCard({
  direction, title, caption, icon: Icon, configs, catalog, countryId, countrySlug, canManage, emptyDescription,
}: {
  direction: "INBOUND" | "OUTBOUND"
  title: string
  caption: string
  icon : typeof ArrowDownToLine
  configs: CountryPaymentMethodConfig[]
  catalog: PaymentMethod[]
  countryId: string
  countrySlug: string
  canManage: boolean
  emptyDescription: string
}) {
  // Subtle directional treatment — INBOUND (collection) reads as success-toned,
  // OUTBOUND (payout) as primary-toned. Left border + icon badge only; no
  // heavy colour blocking (this is an ERP config surface, not a dashboard).
  const tone = direction === "INBOUND"
    ? { border: "border-l-2 border-l-success/60", badge: "icon-badge-success", chip: "badge-success" }
    : { border: "border-l-2 border-l-primary/60", badge: "icon-badge-primary", chip: "badge-info" }

  return (
    <div className={`admin-card space-y-3 ${tone.border}`}>
      <div className="flex items-center gap-2.5">
        <div className={`icon-badge ${tone.badge} h-8 w-8`}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="text-[11px] text-muted-foreground">{caption}</p>
        </div>
        <span className={`ml-auto ${tone.chip}`}>{direction}</span>
      </div>
      {configs.length === 0 ? (
        <EmptyState icon={Icon} title="Not configured" description={emptyDescription} />
      ) : (
        <ul className="divide-y divide-border/60">
          {configs.map((c) => {
            const acct = c.countryProviderAccount
            return (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{c.paymentMethod.name}</p>
                  {acct ? (
                    <p className="text-xs text-muted-foreground">
                      Runs on {acct.paymentProvider.name}
                      <span className="font-mono"> · {acct.environment}</span>
                      {acct.status !== "ACTIVE" && <span className="text-warning"> · account {acct.status.toLowerCase()}</span>}
                      {canManage && (
                        <>
                          {" · "}
                          <Link href={`/countries/${countrySlug}/finance`} className="underline">change on Finance</Link>
                        </>
                      )}
                    </p>
                  ) : (
                    <p className="text-xs text-warning">
                      Not assigned to a provider —{" "}
                      <Link href={`/countries/${countrySlug}/finance`} className="underline">assign one on Finance</Link>
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={c.status === "ACTIVE" ? "badge-success" : c.status === "DEPRECATED" ? "badge-warning" : "badge-neutral"}>
                    {c.status}
                  </span>
                  {canManage && (
                    <>
                      <CountryPaymentMethodSheet countryId={countryId} methods={catalog} existing={c} />
                      <CountryPaymentMethodStatusToggle id={c.id} name={c.paymentMethod.name} status={c.status} />
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
