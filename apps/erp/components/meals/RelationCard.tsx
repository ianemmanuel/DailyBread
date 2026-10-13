import Link from "next/link"
import { ArrowRight, ImageOff, Store, UtensilsCrossed, Briefcase } from "lucide-react"

/*
 * One related record, as a compact card: what it is (the KIND, in the ERP's
 * words — Dish, Listing, Outlet, Vendor), its name, one line of context and
 * ONE way there. Used to show how a Dish, its Listings, their Outlets and the
 * Vendor connect, without repeating the other page inside this one.
 *
 * Server Component; icons are chosen here by kind, never passed in (RSC rule).
 */

type Kind = "dish" | "listing" | "outlet" | "vendor"

const KIND: Record<Kind, { label: string; Icon: typeof Store }> = {
  dish   : { label: "Dish",    Icon: UtensilsCrossed },
  listing: { label: "Listing", Icon: Store },
  outlet : { label: "Outlet",  Icon: Store },
  vendor : { label: "Vendor",  Icon: Briefcase },
}

interface Props {
  kind     : Kind
  title    : string
  subtitle?: string | null
  href     : string
  linkLabel: string
  imageUrl?: string | null
  /** Small state chips (already-formatted label + badge class). */
  badges?  : { label: string; badge: string }[]
}

export function RelationCard({ kind, title, subtitle, href, linkLabel, imageUrl, badges }: Props) {
  const { label, Icon } = KIND[kind]
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3 shadow-[var(--shadow-xs)]">
      {imageUrl !== undefined ? (
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-muted">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- public derivative, already sized
            <img src={imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground"><ImageOff className="h-4 w-4" /></div>
          )}
        </div>
      ) : (
        <div className="icon-badge icon-badge-primary h-12 w-12 shrink-0"><Icon className="h-5 w-5" /></div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-semibold text-foreground">{title}</p>
        {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          {badges?.map((b) => <span key={b.label} className={b.badge}>{b.label}</span>)}
          <Link href={href} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            {linkLabel}
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </div>
  )
}
