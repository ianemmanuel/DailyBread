"use client"

import * as React from "react"
import { toast } from "sonner"
import {
  Plus, Pencil, Trash2, Loader2, ChevronUp, ChevronDown, Check, X, Clock, LayoutList,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"
import { ClientApiError } from "@/lib/api/client"
import { formatPrice, type MenuCurrency } from "@/lib/menu/money"
import {
  useMenuSections, useMenuItems, useCreateMenuSection, useRenameMenuSection,
  useDeleteMenuSection, useReorderMenuSections, useReorderMenuItems,
  type MenuSectionRow, type MenuItem,
} from "@/lib/queries/menu"

/*
 * The menu as a customer meets it: headings in order, dishes in order under
 * each.
 *
 * Its own view rather than controls bolted onto the meal list, because the
 * meal list is paginated and searchable and arranging needs the whole menu at
 * once — you cannot decide what comes third while looking at page two.
 *
 * Up/down rather than drag: there is no drag library in this app, adding one
 * is its own decision, and buttons work on a phone where a long-press drag
 * fights the browser's own scroll.
 *
 * Every reorder sends the WHOLE bucket in its new order. The backend refuses a
 * partial list because there is no correct answer for where the omitted rows
 * land, and this view has the full list to hand anyway.
 */

/** One screenful of menu. Beyond this a vendor wants search, not arrangement,
 *  and this view fetches everything in one go on purpose. */
const MAX_ITEMS = 500

export function MenuArranger({ currency }: { currency: MenuCurrency }) {
  const sectionsQuery = useMenuSections()
  const itemsQuery = useMenuItems({ page: 1, pageSize: MAX_ITEMS })

  const reorderSections = useReorderMenuSections()
  const reorderItems = useReorderMenuItems()
  const createSection = useCreateMenuSection()

  const [newSection, setNewSection] = React.useState("")
  const [adding, setAdding] = React.useState(false)
  const [deleting, setDeleting] = React.useState<MenuSectionRow | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)

  if (sectionsQuery.isLoading || itemsQuery.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  /* Said out loud rather than drawn as an empty menu — the two look identical
   * otherwise, which is how a working page reads as broken. */
  if (sectionsQuery.error || itemsQuery.error) {
    return (
      <div className="dash-card border-[var(--destructive)]/40 p-6">
        <p className="text-sm font-medium text-[var(--destructive)]">Couldn&apos;t load your menu.</p>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          The request failed rather than coming back empty. Try refreshing.
        </p>
      </div>
    )
  }

  const sections = [...(sectionsQuery.data ?? [])].sort((a, b) => a.position - b.position)
  const items = itemsQuery.data?.items ?? []

  const inSection = (sectionId: string | null) =>
    items
      .filter((i) => (i.section?.id ?? null) === sectionId)
      .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))

  const loose = inSection(null)

  async function moveSection(index: number, delta: number) {
    const next = [...sections]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target]!, next[index]!]
    setBusy("sections")
    try {
      await reorderSections.mutateAsync(next.map((s) => s.id))
    } catch (err) {
      toast.error(err instanceof ClientApiError ? err.message : "Couldn't rearrange")
    } finally {
      setBusy(null)
    }
  }

  async function moveItem(sectionId: string | null, list: MenuItem[], index: number, delta: number) {
    const next = [...list]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target]!, next[index]!]
    setBusy(sectionId ?? "loose")
    try {
      await reorderItems.mutateAsync({ sectionId, itemIds: next.map((i) => i.id) })
    } catch (err) {
      toast.error(err instanceof ClientApiError ? err.message : "Couldn't rearrange")
    } finally {
      setBusy(null)
    }
  }

  async function addSection() {
    const name = newSection.trim()
    if (!name) return
    setAdding(true)
    try {
      await createSection.mutateAsync(name)
      setNewSection("")
      toast.success(`"${name}" added`)
    } catch (err) {
      toast.error(err instanceof ClientApiError ? err.message : "Couldn't add that section")
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="dash-card flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-0 flex-1 space-y-1.5">
          <label htmlFor="new-section" className="text-sm font-medium text-[var(--foreground)]">
            Add a section
          </label>
          <Input
            id="new-section"
            value={newSection}
            onChange={(e) => setNewSection(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addSection() } }}
            placeholder="Starters"
            maxLength={60}
          />
        </div>
        <Button type="button" onClick={addSection} disabled={adding || !newSection.trim()}>
          {adding ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Add
        </Button>
      </div>

      {sections.length === 0 && loose.length === 0 ? (
        <div className="dash-card flex flex-col items-center gap-3 px-6 py-12 text-center">
          <div className="flex size-10 items-center justify-center rounded-xl bg-[var(--primary)]/10">
            <LayoutList className="size-5 text-[var(--primary)]" />
          </div>
          <div>
            <p className="text-sm font-medium text-[var(--foreground)]">Nothing to arrange yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-[var(--muted-foreground)]">
              Add a section above, then put your dishes in it from each dish&apos;s own page.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {sections.map((section, index) => (
            <SectionCard
              key={section.id}
              section={section}
              items={inSection(section.id)}
              currency={currency}
              canMoveUp={index > 0}
              canMoveDown={index < sections.length - 1}
              busy={busy === section.id || busy === "sections"}
              onMoveSection={(delta) => moveSection(index, delta)}
              onMoveItem={(list, i, delta) => moveItem(section.id, list, i, delta)}
              onDelete={() => setDeleting(section)}
            />
          ))}

          {loose.length > 0 && (
            <SectionCard
              section={null}
              items={loose}
              currency={currency}
              busy={busy === "loose"}
              onMoveItem={(list, i, delta) => moveItem(null, list, i, delta)}
            />
          )}
        </div>
      )}

      <DeleteSectionDialog section={deleting} onClose={() => setDeleting(null)} />
    </div>
  )
}

function SectionCard({
  section, items, currency, canMoveUp, canMoveDown, busy, onMoveSection, onMoveItem, onDelete,
}: {
  section      : MenuSectionRow | null
  items        : MenuItem[]
  currency     : MenuCurrency
  canMoveUp?   : boolean
  canMoveDown? : boolean
  busy         : boolean
  onMoveSection?: (delta: number) => void
  onMoveItem   : (list: MenuItem[], index: number, delta: number) => void
  onDelete?    : () => void
}) {
  const rename = useRenameMenuSection()
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState("")

  React.useEffect(() => { if (editing && section) setDraft(section.name) }, [editing, section])

  async function saveName() {
    if (!section || !draft.trim()) return
    try {
      await rename.mutateAsync({ sectionId: section.id, name: draft.trim() })
      setEditing(false)
    } catch (err) {
      toast.error(err instanceof ClientApiError ? err.message : "Couldn't rename that section")
    }
  }

  return (
    <div className={cn("dash-card overflow-hidden", busy && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] p-4">
        {section && onMoveSection && (
          <div className="flex shrink-0 flex-col">
            <ArrowButton dir="up" disabled={!canMoveUp || busy} onClick={() => onMoveSection(-1)} />
            <ArrowButton dir="down" disabled={!canMoveDown || busy} onClick={() => onMoveSection(1)} />
          </div>
        )}

        {editing && section ? (
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); saveName() }
                if (e.key === "Escape") setEditing(false)
              }}
              maxLength={60}
              autoFocus
              className="h-8"
            />
            <Button type="button" variant="ghost" size="sm" onClick={saveName}>
              <Check className="size-4" />
              <span className="sr-only">Save name</span>
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
              <X className="size-4" />
              <span className="sr-only">Cancel</span>
            </Button>
          </div>
        ) : (
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold text-[var(--foreground)]">
              {section ? section.name : "Not in a section"}
            </h2>
            <p className="text-xs text-[var(--muted-foreground)]">
              {items.length === 0
                ? "No dishes yet"
                : `${items.length} dish${items.length === 1 ? "" : "es"}`}
              {!section && " · shown after every section"}
            </p>
          </div>
        )}

        {section && !editing && (
          <div className="flex shrink-0 items-center gap-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="size-3.5" />
              <span className="sr-only">Rename {section.name}</span>
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onDelete}>
              <Trash2 className="size-3.5" />
              <span className="sr-only">Remove {section.name}</span>
            </Button>
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <p className="px-4 py-5 text-xs text-[var(--muted-foreground)]">
          Put a dish here from its own page, under Section.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {items.map((item, index) => (
            <li key={item.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="flex shrink-0 flex-col">
                <ArrowButton dir="up" disabled={index === 0 || busy} onClick={() => onMoveItem(items, index, -1)} />
                <ArrowButton dir="down" disabled={index === items.length - 1 || busy} onClick={() => onMoveItem(items, index, 1)} />
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-[var(--foreground)]">{item.name}</p>
                <p className="flex flex-wrap items-center gap-x-2 text-xs text-[var(--muted-foreground)]">
                  <span className="tabular-nums">{formatPrice(item.basePriceMinor, currency)}</span>
                  {item.prepTimeMinutes != null && (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="size-3" />
                      {item.prepTimeMinutes} min
                    </span>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function ArrowButton({
  dir, disabled, onClick,
}: {
  dir: "up" | "down"; disabled: boolean; onClick: () => void
}) {
  const Icon = dir === "up" ? ChevronUp : ChevronDown
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="cursor-pointer rounded p-0.5 text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-25 disabled:hover:bg-transparent"
      aria-label={dir === "up" ? "Move up" : "Move down"}
    >
      <Icon className="size-4" />
    </button>
  )
}

function DeleteSectionDialog({
  section, onClose,
}: {
  section: MenuSectionRow | null; onClose: () => void
}) {
  const deleteSection = useDeleteMenuSection()
  const [pending, setPending] = React.useState(false)

  async function confirm() {
    if (!section) return
    setPending(true)
    try {
      const result = await deleteSection.mutateAsync(section.id)
      toast.success(
        result.freedItems > 0
          ? `Section removed. ${result.freedItems} dish${result.freedItems === 1 ? "" : "es"} kept.`
          : "Section removed",
      )
      onClose()
    } catch (err) {
      toast.error(err instanceof ClientApiError ? err.message : "Something went wrong")
    } finally {
      setPending(false)
    }
  }

  return (
    <AlertDialog open={!!section} onOpenChange={(next) => !next && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove “{section?.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            {section && section._count.items > 0
              ? `Only the heading goes. Its ${section._count.items} dish${
                  section._count.items === 1 ? "" : "es"
                } stay on your menu and move to “Not in a section”, where you can file them again.`
              : "It has no dishes, so nothing else changes."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={confirm} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            Remove heading
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
