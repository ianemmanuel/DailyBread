import Link from "next/link"
import type { LucideIcon } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@repo/ui/components/table"
import { EmptyState } from "@/components/shared/EmptyState"
import { FOOD_TAG_META, type FoodTagKind, type FoodTagAdoptionResult } from "@/types/food-tag.types"

/**
 * What vendors actually picked from one food-tag catalog.
 *
 * The share bar is deliberately measured against **vendor profiles**, not
 * against total selections: a vendor picks several cuisines, so shares here sum
 * well past 100% and a pie or a percentage-of-total would be a lie. The header
 * says what the denominator is for exactly that reason.
 *
 * Zero-adoption rows are kept. "We offer this here and nobody picked it" is the
 * useful finding, and filtering those rows out would hide it — so they get their
 * own muted treatment rather than disappearing.
 */

interface Props {
  kind    : FoodTagKind
  icon    : LucideIcon
  data    : FoodTagAdoptionResult | null
  /** Country name, or "All countries" — stated so the numbers are unambiguous. */
  scopeLabel: string
  /** Country slug in view, carried into the catalog links. */
  countrySlug?: string
  /** Show at most this many rows; the rest are behind the catalog link. */
  limit?  : number
}

export function FoodTagAdoptionPanel({
  kind, icon: Icon, data, scopeLabel, countrySlug, limit = 12,
}: Props) {
  const meta        = FOOD_TAG_META[kind]
  const catalogHref = countrySlug ? `/food-tags/${kind}?country=${countrySlug}` : `/food-tags/${kind}`

  if (!data) {
    return (
      <div className="admin-card space-y-3">
        <PanelHeader icon={Icon} title={meta.title} subtitle={scopeLabel} href={catalogHref} />
        <p className="text-sm text-destructive">
          Couldn&apos;t load {meta.title.toLowerCase()} adoption. Reload the page to try again.
        </p>
      </div>
    )
  }

  const rows    = data.items.slice(0, limit)
  const hidden  = data.items.length - rows.length
  const adopted = data.items.filter((i) => i.count > 0).length

  return (
    <div className="admin-card space-y-4">
      <PanelHeader icon={Icon} title={meta.title} subtitle={scopeLabel} href={catalogHref} />

      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <Metric label="Vendor profiles" value={data.profileTotal} />
        <Metric label="Picked at least once" value={adopted} />
        <Metric label="Offered, never picked" value={data.unadoptedCount} tone={data.unadoptedCount > 0 ? "warning" : undefined} />
        {data.offeredCount != null && <Metric label="Offered here" value={data.offeredCount} />}
      </div>

      {data.profileTotal === 0 ? (
        <EmptyState
          icon={Icon}
          title="No vendor profiles yet"
          description={`Adoption is measured across vendor profiles. Nothing has been published in ${scopeLabel.toLowerCase()} yet, so there is nothing to rank.`}
        />
      ) : (
        <>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="text-xs uppercase tracking-wide">{meta.singular}</TableHead>
                  <TableHead className="w-40 text-xs uppercase tracking-wide">
                    Share of profiles
                  </TableHead>
                  <TableHead className="w-20 text-right text-xs uppercase tracking-wide">Vendors</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((item) => (
                  <TableRow key={item.id} className="hover:bg-muted/10">
                    <TableCell className="font-medium text-foreground">
                      <span className={item.count === 0 ? "text-muted-foreground" : undefined}>{item.name}</span>
                      <span className="ml-2 inline-flex gap-1.5 align-middle">
                        {item.status !== "ACTIVE" && <span className="badge-neutral">Suspended</span>}
                        {item.offeredInCountry === false && <span className="badge-neutral">Not offered</span>}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-full max-w-24 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${Math.min(item.share, 100)}%` }}
                          />
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground">{item.share}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-sm text-foreground">{item.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {hidden > 0 && (
            <Link href={catalogHref} className="view-all-link text-xs">
              {hidden} more in the catalog →
            </Link>
          )}
        </>
      )}
    </div>
  )
}

function PanelHeader({
  icon: Icon, title, subtitle, href,
}: { icon: LucideIcon; title: string; subtitle: string; href: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2.5">
        <div className="icon-badge icon-badge-primary h-9 w-9"><Icon className="h-4 w-4" /></div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <Link href={href} className="view-all-link text-xs">Manage catalog →</Link>
    </div>
  )
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: "warning" }) {
  return (
    <div>
      <p className={`font-display text-xl font-semibold ${tone === "warning" ? "text-warning" : "text-foreground"}`}>
        {value}
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}
