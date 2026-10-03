import { BookOpen, ImageOff } from "lucide-react"

/*
 * A vendor's menus at one outlet — READ ONLY. The ERP can see menus (under
 * the meals:read permission, scoped by the vendor's country) and has no way
 * to change them: there are no admin write routes for menus at all. A menu is
 * the vendor's own arrangement of meals the ERP already moderates per meal.
 *
 * Failed and empty are different answers (bug class #4): `menus` is null when
 * the read failed.
 */
export interface AdminOutletMenu {
  id         : string
  name       : string
  description: string | null
  image      : { url: string } | null
  mealCount  : number
  updatedAt  : string
}

export function OutletMenusPanel({ menus }: { menus: AdminOutletMenu[] | null }) {
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <BookOpen className="size-4 text-muted-foreground" aria-hidden />
        <h2 className="text-sm font-semibold text-foreground">Menus</h2>
        <span className="text-xs text-muted-foreground">· set by the vendor, view only</span>
      </div>

      {menus === null ? (
        <p role="alert" className="text-sm text-destructive">Couldn&apos;t load this outlet&apos;s menus. The request failed — this is not an empty list.</p>
      ) : menus.length === 0 ? (
        <p className="text-sm text-muted-foreground">The vendor hasn&apos;t created a menu for this outlet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {menus.map((menu) => (
            <li key={menu.id} className="flex items-center gap-3 py-2.5">
              <div className="relative size-10 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                {menu.image
                  // eslint-disable-next-line @next/next/no-img-element -- public master; avoids per-host next/image config
                  ? <img src={menu.image.url} alt="" className="absolute inset-0 size-full object-contain" />
                  : <ImageOff aria-hidden className="absolute inset-0 m-auto size-4 text-muted-foreground" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{menu.name}</p>
                {menu.description && <p className="truncate text-xs text-muted-foreground">{menu.description}</p>}
              </div>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {menu.mealCount} meal{menu.mealCount === 1 ? "" : "s"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
