import { FileText, Settings2 } from "lucide-react"
import { UpdateOutletForm } from "@/components/outlets/UpdateOutletForm"
import { OutletDocumentsSection } from "@/components/outlets/OutletDocumentsSection"
import type { Outlet } from "@/types/outlet"

/*
 * The editable half of an outlet page: details (which now carries a full-width
 * map picker) and documents.
 *
 * Both are full width. They used to sit in a 3-column grid with the edit form
 * at 2/3 and the hours editor crammed into the remaining third, which is what
 * made hours cut off. Hours moved out to its own summary card near the top of
 * the page, and a form containing a map has no business being two thirds of a
 * row anyway.
 */

function Panel({
  icon: Icon, title, description, children,
}: {
  icon        : React.ElementType
  title       : string
  description : string
  children    : React.ReactNode
}) {
  return (
    <section className="dash-card overflow-hidden">
      <header className="flex items-start gap-3 border-b border-[var(--border)]/60 px-5 py-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <Icon className="size-4 text-[var(--primary)]" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-[var(--foreground)]">{title}</h2>
          <p className="text-xs text-[var(--muted-foreground)]">{description}</p>
        </div>
      </header>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  )
}

export function OutletEditSections({ outlet }: { outlet: Outlet }) {
  return (
    <>
      <Panel
        icon={Settings2}
        title="Outlet details"
        description="Address, contact, delivery settings and where your pin sits"
      >
        <UpdateOutletForm outlet={outlet} />
      </Panel>

      <Panel
        icon={FileText}
        title="Documents"
        description="Permits and licences required for this location"
      >
        <OutletDocumentsSection outletId={outlet.id} />
      </Panel>
    </>
  )
}
