import { MapPin, Phone, Mail, Star, Utensils, UtensilsCrossed } from "lucide-react"
import type { Outlet } from "@/types/outlet"

/*
 * The outlet at a glance — address, contact, cuisines and the two numbers a
 * vendor actually checks. Everything editable lives further down the page; this
 * is the header they read, not a form.
 *
 * Previously the two stats sat in a boxed three-column grid that took the full
 * height of the card to show two digits and a status dot. They are chips now,
 * and the dot is gone: the outlet's real status is already stated twice above
 * this card, in the page header badges and the go-live panel.
 */

function ContactLine({
  icon: Icon, children, href,
}: {
  icon    : React.ElementType
  children: React.ReactNode
  href?   : string
}) {
  const body = (
    <>
      <Icon className="mt-0.5 size-4 shrink-0 text-[var(--primary)]" />
      {/* min-w-0 + break-words: a long address or email must wrap inside the
          card on a phone rather than pushing the layout wider than the screen. */}
      <span className="min-w-0 break-words">{children}</span>
    </>
  )

  return href ? (
    <a href={href} className="flex items-start gap-2 hover:text-[var(--foreground)]">{body}</a>
  ) : (
    <p className="flex items-start gap-2">{body}</p>
  )
}

function StatChip({
  icon: Icon, label, value,
}: {
  icon : React.ElementType
  label: string
  value: React.ReactNode
}) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-xl px-3 py-1.5"
      style={{ background: "color-mix(in oklch, var(--muted) 40%, transparent)" }}
    >
      <Icon className="size-3.5 text-[var(--primary)]" />
      <span className="text-sm font-semibold text-[var(--foreground)]">{value}</span>
      <span className="text-xs text-[var(--muted-foreground)]">{label}</span>
    </span>
  )
}

export function OutletDetailHero({ outlet }: { outlet: Outlet }) {
  const fullAddress = [outlet.addressLine1, outlet.neighborhood, outlet.city?.name]
    .filter(Boolean)
    .join(", ")

  return (
    <div className="dash-card flex h-full flex-col gap-4 p-5">
      <div className="space-y-2 text-sm text-[var(--muted-foreground)]">
        <ContactLine icon={MapPin}>{fullAddress}</ContactLine>
        {outlet.phone && (
          <ContactLine icon={Phone} href={`tel:${outlet.phone}`}>{outlet.phone}</ContactLine>
        )}
        {outlet.email && (
          <ContactLine icon={Mail} href={`mailto:${outlet.email}`}>{outlet.email}</ContactLine>
        )}
      </div>

      {outlet.bio && (
        <p className="border-l-2 border-[var(--primary)]/30 pl-3 text-sm italic leading-relaxed text-[var(--muted-foreground)]">
          {outlet.bio}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <StatChip
          icon={UtensilsCrossed}
          label={outlet._count?.meals === 1 ? "meal" : "meals"}
          value={outlet._count?.meals ?? 0}
        />
        <StatChip
          icon={Star}
          // A bare rating with no volume behind it is misleading, so the chip
          // says how many reviews produced it — or that there are none yet.
          label={outlet.totalReviews > 0
            ? `from ${outlet.totalReviews} ${outlet.totalReviews === 1 ? "review" : "reviews"}`
            : "no reviews yet"}
          value={outlet.ratings > 0 ? outlet.ratings.toFixed(1) : "—"}
        />
      </div>

      {outlet.cuisines.length > 0 && (
        <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
          {outlet.cuisines.map((cuisine) => (
            <span key={cuisine.id} className="badge-primary">
              <Utensils className="size-2.5" />{cuisine.name}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
