"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Plus, Pencil, Globe2, MapPin } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet"
import { MealReasonActions, MEAL_REASON_ACTION_LABEL, type MealReasonAction } from "@repo/types/enums"
import type { MealReasonLibraryRow } from "@/types"

/*
 * Create or edit ONE Action Reason. Writes go to the one reason system
 * (/admin/v1/action-reasons); the backend checks the permission and the REACH
 * (platform-wide needs a global admin, a country reason that country's admin).
 *
 * The CODE is the system's: generated from the first name and never edited,
 * so it is not a field here. A country VERSION reuses the platform reason's
 * code — that shared code is what makes it replace the platform one there.
 * Non-meal uses of the same reason are kept as they are on save.
 */

type Props = (
  /** A new reason: platform-wide (countryId null) or a country's own. */
  | { mode: "create"; countryId: string | null; reachLabel: string }
  /** A country VERSION of a platform reason: replaces it in that country only. */
  | { mode: "override"; base: MealReasonLibraryRow; countryId: string; countryName: string }
  | { mode: "edit"; reason: MealReasonLibraryRow }
) & {
  /** Controlled from outside (e.g. a row's menu); otherwise renders its own trigger. */
  open?        : boolean
  onOpenChange?: (open: boolean) => void
}

const ACTION_GROUPS: { title: string; hint: string; actions: { key: MealReasonAction; hint: string }[] }[] = [
  {
    title  : "One listing",
    hint   : "One dish at one outlet",
    actions: [
      { key: MealReasonActions.LISTING_HIDE,    hint: "Quietly take it off the marketplace" },
      { key: MealReasonActions.LISTING_SUSPEND, hint: "Pause it at that outlet; the vendor is told" },
    ],
  },
  {
    title  : "The whole dish",
    hint   : "Every outlet that sells it — country and global admins",
    actions: [
      { key: MealReasonActions.DISH_SEND_BACK,  hint: "Ask the vendor to revise the dish" },
      { key: MealReasonActions.GROUP_SEND_BACK, hint: "Ask the vendor to revise one option group" },
      { key: MealReasonActions.DISH_SUSPEND,    hint: "Pause the dish everywhere" },
      { key: MealReasonActions.DISH_BAN,        hint: "Remove the dish; the vendor cannot edit it" },
    ],
  },
]

export function ReasonForm(props: Props) {
  const router  = useRouter()
  const editing = props.mode === "edit" ? props.reason : null
  const base    = props.mode === "override" ? props.base : null
  const seed    = editing ?? base

  const controlled = props.open !== undefined
  const [ownOpen, setOwnOpen] = useState(false)
  const open    = controlled ? props.open! : ownOpen
  const setOpen = (o: boolean) => (controlled ? props.onOpenChange?.(o) : setOwnOpen(o))

  const [pending, setPending] = useState(false)
  const [label, setLabel]     = useState("")
  const [message, setMessage] = useState("")
  const [actions, setActions] = useState<MealReasonAction[]>([])
  const [active, setActive]   = useState(true)

  // Reset to the record each time the sheet opens, so a cancelled edit never
  // leaks into the next one.
  useEffect(() => {
    if (!open) return
    setLabel(seed?.label ?? ""); setMessage(seed?.vendorMessage ?? "")
    setActions(seed?.appliesTo ?? []); setActive(editing?.isActive ?? true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const countryId = props.mode === "create" || props.mode === "override" ? props.countryId : editing?.countryId ?? null
  const toggle = (a: MealReasonAction, on: boolean) =>
    setActions((cur) => (on ? [...new Set([...cur, a])] : cur.filter((x) => x !== a)))
  const ready = label.trim() && message.trim() && actions.length > 0

  const reach = editing
    ? editing.countryName
      ? { icon: MapPin, text: editing.replacesPlatformId ? `${editing.countryName} version of a platform reason` : `${editing.countryName} only` }
      : { icon: Globe2, text: "Platform-wide — every country without its own version" }
    : props.mode === "override"
      ? { icon: MapPin, text: `${props.countryName} version — replaces “${props.base.label}” in ${props.countryName} only` }
      : props.mode === "create"
        ? { icon: countryId ? MapPin : Globe2, text: props.reachLabel }
        : null

  async function save() {
    setPending(true)
    const res = editing
      ? await fetch(`/api/meals/reasons/library/${editing.id}`, {
          method : "PATCH",
          headers: { "Content-Type": "application/json" },
          body   : JSON.stringify({
            label: label.trim(), description: message.trim(), isActive: active,
            appliesTo: [...actions, ...editing.otherUses],
          }),
        })
      : await fetch("/api/meals/reasons/library", {
          method : "POST",
          headers: { "Content-Type": "application/json" },
          body   : JSON.stringify({
            label: label.trim(), description: message.trim(), appliesTo: actions,
            ...(countryId ? { countryId } : {}),
            // Only a country version names a code: the one it replaces.
            ...(base ? { code: base.code } : {}),
          }),
        })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      toast.success(editing ? "Action reason updated" : "Action reason added")
      setOpen(false)
      router.refresh()
    } else toast.error(data.message ?? "Something went wrong")
    setPending(false)
  }

  const title = editing
    ? "Edit action reason"
    : props.mode === "override" ? `Add ${props.countryName} version`
    : countryId ? "Add country action reason" : "Create platform action reason"

  return (
    <>
      {!controlled && (
        editing ? (
          <Button type="button" size="sm" variant="outline" className="gap-1.5 rounded-full" onClick={() => setOpen(true)}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
        ) : props.mode === "override" ? (
          <Button type="button" size="sm" variant="outline" className="gap-1.5 rounded-full" onClick={() => setOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Add {props.countryName} version
          </Button>
        ) : (
          <Button type="button" className="gap-1.5 rounded-full" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> {countryId ? "Add country reason" : "Create platform reason"}
          </Button>
        )
      )}

      <Sheet open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
          <SheetHeader className="border-b border-border/70 px-6 py-5">
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>
              {editing
                ? "Changes apply to future actions only. Every past action keeps the wording it was taken with."
                : "Admins choose it when taking an action; the vendor reads its explanation."}
            </SheetDescription>
            {reach && (
              <p className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-full border border-border/70 bg-muted/40 px-2.5 py-1 text-xs text-foreground">
                <reach.icon className="h-3.5 w-3.5 text-muted-foreground" />
                {reach.text}
              </p>
            )}
          </SheetHeader>

          <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
            <div className="space-y-1.5">
              <Label htmlFor="reason-name">Name</Label>
              <Input id="reason-name" value={label} onChange={(e) => setLabel(e.target.value)}
                placeholder="Incorrect allergen information" />
              <p className="text-xs text-muted-foreground">What admins see in the reason picker.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reason-message">Explanation for the vendor</Label>
              <Textarea id="reason-message" value={message} onChange={(e) => setMessage(e.target.value)}
                className="min-h-28 text-sm"
                placeholder="What is wrong, in plain words, and what would make it acceptable." />
              <p className="text-xs text-muted-foreground">Used exactly as written. Admins cannot change it per action.</p>
            </div>

            <fieldset className="space-y-3">
              <legend className="text-sm font-medium text-foreground">Can justify</legend>
              {ACTION_GROUPS.map((g) => (
                <div key={g.title} className="space-y-1.5">
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{g.title}</span> · {g.hint}
                  </p>
                  <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70">
                    {g.actions.map(({ key, hint }) => {
                      const checked = actions.includes(key)
                      return (
                        <label
                          key={key}
                          className={`flex cursor-pointer items-start gap-3 px-3 py-2.5 transition-colors ${checked ? "bg-primary/5" : "hover:bg-muted/40"}`}
                        >
                          <Checkbox className="mt-0.5" checked={checked} onCheckedChange={(v) => toggle(key, v === true)} />
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-foreground">{MEAL_REASON_ACTION_LABEL[key]}</span>
                            <span className="block text-xs text-muted-foreground">{hint}</span>
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              ))}
            </fieldset>

            {editing && (
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border/70 px-3 py-2.5">
                <span>
                  <span className="block text-sm font-medium text-foreground">Active</span>
                  <span className="block text-xs text-muted-foreground">Inactive reasons are not offered to admins.</span>
                </span>
                <Switch checked={active} onCheckedChange={setActive} />
              </label>
            )}
            {editing && editing.otherUses.length > 0 && (
              <p className="text-xs text-muted-foreground">
                This reason is also used outside Meals; those uses are kept as they are.
              </p>
            )}
          </div>

          <SheetFooter className="flex-row justify-end gap-2 border-t border-border/70 px-6 py-4">
            <Button type="button" variant="outline" className="rounded-full" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
            <Button type="button" className="gap-1.5 rounded-full" onClick={save} disabled={pending || !ready}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? "Save changes" : "Add reason"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  )
}
