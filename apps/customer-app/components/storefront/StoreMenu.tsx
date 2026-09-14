import { MenuItemCard } from "./MenuItemCard"
import { MenuSectionRail } from "./MenuSectionRail"
import type { Storefront } from "@repo/types/customer-app"

/*
 * The menu.
 *
 * A Server Component that renders the whole menu in one pass — sections in the
 * order the vendor arranged them, dishes in the order they placed them inside
 * each. That ordering is authored, never alphabetical, which is the whole
 * reason MenuSection.position and MenuItem.position exist; rendering it any
 * other way would quietly discard a decision the vendor made.
 *
 * No tabs and no lazy loading of sections. A menu is read by scrolling, the
 * whole thing is one request, and anchor links are free — so the rail scrolls
 * rather than swapping content, and every section is on the page for search and
 * for ctrl-F.
 */
export function StoreMenu({ store }: { store: Storefront }) {
  const sections = store.sections.filter((section) => section.items.length > 0)

  if (sections.length === 0) {
    return (
      <div className="surface px-6 py-12 text-center">
        <p className="font-medium text-[var(--foreground)]">This menu is empty right now</p>
        <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-[var(--muted-foreground)]">
          The kitchen hasn&apos;t published any dishes yet. Try another restaurant, or check back later.
        </p>
      </div>
    )
  }

  const closed = !store.isAcceptingOrders

  return (
    <div className="space-y-8">
      {/* Only when there is something to navigate between. */}
      {sections.length > 1 && <MenuSectionRail sections={sections} />}

      {sections.map((section) => (
        <section key={section.id} id={`section-${section.id}`} className="scroll-mt-32 space-y-3">
          <h2 className="heading-lg text-[var(--foreground)]">{section.name}</h2>

          {/* Two columns from lg. A menu list is read down, so one column on a
              phone and a tablet; a third column would make the rows too narrow
              for a dish name plus its description. */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {section.items.map((item) => (
              <MenuItemCard
                key={item.id}
                item={item}
                currency={store.currency}
                outlet={{ id: store.outletId, name: store.displayName }}
                disabled={closed}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
