import Link from "next/link"
import { ImageOff, MapPin, UtensilsCrossed } from "lucide-react"
import type { VendorMenu } from "@/lib/queries/menus"

/*
 * One menu in the list. The image sits in a FIXED square frame and is
 * contained, not cropped — a logo's edges are part of the logo, and a wide
 * wordmark must not decide the card's height (the meal-card fix, applied here
 * from the start).
 */
export function MenuCard({ menu }: { menu: VendorMenu }) {
  return (
    <Link
      href={`/menus/${menu.id}`}
      className="dash-card group flex min-w-0 items-center gap-4 p-4 transition-shadow hover:shadow-md"
    >
      <div className="relative size-20 shrink-0 overflow-hidden rounded-xl border border-border bg-muted">
        {menu.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- public master
          <img src={menu.image.url} alt="" loading="lazy" className="absolute inset-0 size-full object-contain p-1" />
        ) : (
          <ImageOff aria-hidden className="absolute inset-0 m-auto size-5 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-semibold text-foreground group-hover:underline">{menu.name}</h3>
        {menu.description && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{menu.description}</p>}
        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <span className="inline-flex min-w-0 items-center gap-1"><MapPin aria-hidden className="size-3 shrink-0" /><span className="truncate">{menu.outlet.name}</span></span>
          <span className="inline-flex items-center gap-1"><UtensilsCrossed aria-hidden className="size-3" />{menu.mealCount} meal{menu.mealCount === 1 ? "" : "s"}</span>
        </p>
      </div>
    </Link>
  )
}
