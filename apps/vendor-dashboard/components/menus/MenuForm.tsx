"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { BookOpen, ImageIcon, ListChecks, Loader2, MapPin, Save, Check, ImageOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { FormSection, FormField } from "@/components/dashboard/form"
import { ClientApiError } from "@/lib/api/client"
import { formatPrice } from "@/lib/menu/money"
import { useMenuContext } from "@/lib/queries/menu"
import {
  useCreateMenu, useUpdateMenu, useOutletMealsForMenu,
  type VendorMenuDetail, type MenuSectionGroup,
} from "@/lib/queries/menus"
import { MenuLogoField, type MenuLogoValue } from "./MenuLogoField"

/*
 * Create or edit one menu: a location's named, branded selection of the meals
 * that location already sells.
 *
 * A menu copies nothing about a dish. The picker lists the meals at the chosen
 * location (by their existing section) and the save sends their ids; price,
 * availability and options stay on the meal. A menu belongs to its location
 * for life, so the location is chosen once, on create.
 *
 * Validation here is a preview; the server checks ownership of the location,
 * every meal and the image on every save.
 */

const NAME_MAX = 60
const DESCRIPTION_MAX = 300

export function MenuForm({ menu }: { menu?: VendorMenuDetail }) {
  const router = useRouter()
  const isEdit = !!menu
  const { data: context, isLoading: contextLoading } = useMenuContext()
  const createMenu = useCreateMenu()
  const updateMenu = useUpdateMenu(menu?.id ?? "")

  const [outletId, setOutletId] = React.useState<string>(menu?.outlet.id ?? "")
  const [name, setName] = React.useState(menu?.name ?? "")
  const [description, setDescription] = React.useState(menu?.description ?? "")
  const [logo, setLogo] = React.useState<MenuLogoValue | null>(
    menu ? { storageKey: menu.imageStorageKey, url: menu.image?.url ?? null, isLocal: false } : null,
  )
  const [selected, setSelected] = React.useState<Set<string>>(new Set(menu?.mealIds ?? []))
  const [errors, setErrors] = React.useState<{ outlet?: string; name?: string; logo?: string }>({})
  const [saving, setSaving] = React.useState(false)

  // A single-location vendor is never asked a question with one answer.
  React.useEffect(() => {
    if (!isEdit && !outletId && context?.outlets.length === 1) setOutletId(context.outlets[0]!.id)
  }, [context, isEdit, outletId])

  const { data: outletMeals, isLoading: mealsLoading, error: mealsError } = useOutletMealsForMenu(outletId || null)

  function chooseOutlet(id: string) {
    setOutletId(id)
    // Meals belong to one location; a selection from another means nothing here.
    setSelected(new Set())
    setErrors((e) => ({ ...e, outlet: undefined }))
  }

  function toggle(mealId: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(mealId)) next.delete(mealId)
      else next.add(mealId)
      return next
    })
  }

  function toggleSection(section: MenuSectionGroup, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const meal of section.meals) {
        if (on) next.add(meal.mealId)
        else next.delete(meal.mealId)
      }
      return next
    })
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const found: typeof errors = {}
    if (!outletId) found.outlet = "Choose the location this menu is for."
    if (!name.trim()) found.name = "Give the menu a name."
    if (!logo) found.logo = "A menu needs an image or logo."
    setErrors(found)
    if (Object.keys(found).length > 0) { toast.error("Check the highlighted fields"); return }

    // Only ids still at this location — the picker is the source. Until the
    // picker has loaded, the list is NOT sent: an empty array would replace
    // the menu's meals with nothing, while an absent one leaves them alone.
    const available = outletMeals
      ? new Set(outletMeals.sections.flatMap((s) => s.meals.map((m) => m.mealId)))
      : null
    const body = {
      ...(isEdit ? {} : { outletId }),
      name       : name.trim(),
      description: description.trim() || null,
      imageKey   : logo!.storageKey,
      ...(available ? { mealIds: [...selected].filter((id) => available.has(id)) } : {}),
    }

    setSaving(true)
    try {
      if (isEdit) {
        await updateMenu.mutateAsync(body)
        toast.success("Menu saved")
        router.refresh()
      } else {
        const created = await createMenu.mutateAsync(body)
        toast.success("Menu created")
        router.push(`/menus/${created.id}`)
      }
    } catch (err) {
      toast.error(err instanceof ClientApiError ? err.message : "Couldn't save the menu")
    } finally {
      setSaving(false)
    }
  }

  if (contextLoading || !context) {
    return <div className="space-y-4">{[0, 1].map((i) => <Skeleton key={i} className="h-48 w-full rounded-2xl" />)}</div>
  }

  if (context.outlets.length === 0) {
    return (
      <div className="dash-card p-8 text-center">
        <h2 className="text-sm font-semibold text-foreground">Add a location first</h2>
        <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">A menu belongs to one of your locations.</p>
        <Button asChild className="mt-4 rounded-full"><Link href="/outlets/create">Add a location</Link></Button>
      </div>
    )
  }

  const sections = outletMeals?.sections ?? []
  const currency = outletMeals?.currency ?? context.currency

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <FormSection icon={BookOpen} title="The menu" description="What this menu is called at its location.">
          <FormField label="Location" required error={errors.outlet}
            hint={isEdit ? "A menu stays with the location it was made for." : "Which of your locations this menu is for."}>
            {isEdit ? (
              <p className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                <MapPin aria-hidden className="size-4 text-muted-foreground" /> {menu!.outlet.name}
              </p>
            ) : (
              <Select value={outletId} onValueChange={chooseOutlet}>
                <SelectTrigger aria-label="Location" className="w-full"><SelectValue placeholder="Choose a location" /></SelectTrigger>
                <SelectContent>
                  {context.outlets.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </FormField>

          <FormField label="Name" required counter={`${name.length}/${NAME_MAX}`} error={errors.name}
            hint="For example Breakfast, All day or Weekend specials.">
            <Input value={name} maxLength={NAME_MAX} placeholder="Breakfast"
              onChange={(e) => { setName(e.target.value); setErrors((x) => ({ ...x, name: undefined })) }} />
          </FormField>

          <FormField label="Description" counter={`${description.length}/${DESCRIPTION_MAX}`}
            hint="Optional. What this menu is for, in a line or two.">
            <Textarea value={description} maxLength={DESCRIPTION_MAX} className="min-h-20"
              placeholder="Served 7–11am, Monday to Saturday." onChange={(e) => setDescription(e.target.value)} />
          </FormField>
        </FormSection>

        <FormSection icon={ImageIcon} title="Image or logo" description="Shown wherever this menu is shown.">
          <MenuLogoField value={logo} disabled={saving} error={errors.logo}
            onChange={(v) => { setLogo(v); setErrors((x) => ({ ...x, logo: undefined })) }} />
        </FormSection>
      </div>

      <FormSection
        icon={ListChecks}
        title="Meals on this menu"
        description="Choose from the meals already sold at this location. Prices, availability and options come from each meal."
        aside={outletId ? <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{selected.size} chosen</span> : undefined}
      >
        {!outletId ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            Choose a location to see its meals.
          </p>
        ) : mealsLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : mealsError ? (
          <p role="alert" className="rounded-xl border border-destructive/40 px-4 py-4 text-sm text-destructive">
            Couldn&apos;t load this location&apos;s meals. The request failed rather than coming back empty — try again.
          </p>
        ) : sections.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            This location doesn&apos;t sell any meals yet. <Link href="/meals/create" className="font-medium text-primary hover:underline">Add a meal</Link> and
            choose this location under &ldquo;Where it&apos;s sold&rdquo;.
          </div>
        ) : (
          <div className="space-y-4">
            {sections.map((section) => {
              const ids = section.meals.map((m) => m.mealId)
              const allOn = ids.every((id) => selected.has(id))
              const label = section.name ?? "Not in a section"
              return (
                <fieldset key={section.id ?? "none"} className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <legend className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</legend>
                    <button type="button" onClick={() => toggleSection(section, !allOn)}
                      className="cursor-pointer text-xs font-medium text-primary hover:underline">
                      {allOn ? "Clear" : "Select all"}
                      <span className="sr-only"> in {label}</span>
                    </button>
                  </div>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {section.meals.map((meal) => {
                      const on = selected.has(meal.mealId)
                      return (
                        <li key={meal.mealId}>
                          <label className={cn(
                            "flex cursor-pointer items-center gap-3 rounded-xl border p-2.5 transition-colors",
                            on ? "border-primary/50 bg-primary/5" : "border-border hover:bg-muted/40",
                          )}>
                            <input type="checkbox" checked={on} onChange={() => toggle(meal.mealId)}
                              className="size-4 shrink-0 cursor-pointer accent-[var(--primary)]" />
                            <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                              {meal.image
                                // eslint-disable-next-line @next/next/no-img-element -- public master
                                ? <img src={meal.image.url} alt="" className="size-full object-cover" />
                                : <ImageOff aria-hidden className="size-4 text-muted-foreground" />}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-foreground">{meal.name}</span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {formatPrice(meal.priceMinor, currency)}
                                {!meal.isAvailable && " · off right now"}
                                {meal.isArchived && " · archived"}
                              </span>
                            </span>
                            {on && <Check aria-hidden className="size-4 shrink-0 text-primary" />}
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                </fieldset>
              )
            })}
          </div>
        )}
      </FormSection>

      <div className="rounded-2xl border border-border bg-card px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            <span className="text-destructive">*</span> Required. Menus are for your team for now — customers don&apos;t see them yet.
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" className="rounded-full" disabled={saving} onClick={() => router.push("/menus")}>
              Cancel
            </Button>
            <Button type="submit" className="gap-1.5 rounded-full" disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {saving ? "Saving…" : isEdit ? "Save changes" : "Create menu"}
            </Button>
          </div>
        </div>
      </div>
    </form>
  )
}
