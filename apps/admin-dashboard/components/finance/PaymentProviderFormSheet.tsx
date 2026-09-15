"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Plus, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet"
import {
  PAYMENT_PROVIDER_CAPABILITIES,
  type PaymentProvider,
  type PaymentProviderCapability,
} from "@repo/types/admin-app"

interface Props {
  /** Omit for create mode, pass the provider for edit mode. */
  provider?: PaymentProvider
}

const METHOD_TYPES = ["MOBILE_MONEY", "BANK", "DIGITAL_WALLET", "CARD"] as const
type MethodType = (typeof METHOD_TYPES)[number]

const CAP_LABEL = (c: string) => c.replace(/_/g, " ").toLowerCase()

/**
 * Create/edit a PaymentProvider CATALOG entry — a declaration of a
 * provider implementation the platform can be wired to, plus the
 * capabilities its future adapter is expected to support. Credentials and
 * per-country wiring are NOT set here. Code is immutable after creation.
 */
export function PaymentProviderFormSheet({ provider }: Props) {
  const router = useRouter()
  const isEdit = !!provider

  const [open, setOpen] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const [code, setCode] = useState(provider?.code ?? "")
  const [name, setName] = useState(provider?.name ?? "")
  const [capabilities, setCapabilities] = useState<PaymentProviderCapability[]>(provider?.capabilities ?? [])
  const [methodTypes, setMethodTypes] = useState<MethodType[]>((provider?.methodTypes as MethodType[]) ?? [])
  const [currencies, setCurrencies] = useState((provider?.supportedCurrencies ?? []).join(", "))
  const [description, setDescription] = useState(provider?.description ?? "")

  function toggle<T>(setter: React.Dispatch<React.SetStateAction<T[]>>, value: T) {
    setter((prev) => (prev.includes(value) ? prev.filter((x) => x !== value) : [...prev, value]))
  }

  async function submit() {
    if (!name.trim() || (!isEdit && !code.trim()) || capabilities.length === 0) return
    setFormError(null)
    setPending(true)

    const supportedCurrencies = currencies
      .split(",")
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean)

    const payload = {
      ...(isEdit ? {} : { code: code.trim().toUpperCase() }),
      name: name.trim(),
      capabilities,
      methodTypes,
      supportedCurrencies,
      description: description.trim() || undefined,
    }

    try {
      const res = await fetch(isEdit ? `/api/finance/providers/${provider.code}` : "/api/finance/providers", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(isEdit ? "Provider updated" : "Provider created")
        setOpen(false)
        router.refresh()
      } else {
        const msg = data.message ?? "Something went wrong."
        setFormError(msg)
        toast.error(isEdit ? "Update failed" : "Creation failed", { description: msg })
      }
    } catch {
      setFormError("Network error. Please try again.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => { setOpen(o); if (!o) setFormError(null) }}>
      {isEdit ? (
        <Button type="button" variant="outline" size="sm" className="gap-1.5 rounded-full" onClick={() => setOpen(true)}>
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </Button>
      ) : (
        <Button type="button" size="sm" className="gap-1.5 rounded-full shadow-sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          New Provider
        </Button>
      )}

      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit payment provider" : "New payment provider"}</SheetTitle>
          <SheetDescription>
            A catalog declaration only — no API keys, no per-country wiring. Those come later.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {formError && <p className="text-sm text-destructive">{formError}</p>}

          {!isEdit && (
            <div className="space-y-1.5">
              <Label className="text-xs">Code *</Label>
              <Input
                placeholder="e.g. FLUTTERWAVE"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="rounded-xl text-sm font-mono"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">Stable identifier — can&apos;t be changed after creation.</p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="rounded-xl text-sm" placeholder="e.g. Flutterwave" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Capabilities * (at least one)</Label>
            <div className="grid grid-cols-1 gap-2 rounded-xl border border-border/60 bg-muted/20 px-3.5 py-3">
              {PAYMENT_PROVIDER_CAPABILITIES.map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm text-foreground">
                  <Checkbox checked={capabilities.includes(c)} onCheckedChange={() => toggle(setCapabilities, c)} />
                  {CAP_LABEL(c)}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Method types</Label>
            <div className="flex flex-wrap gap-3 rounded-xl border border-border/60 bg-muted/20 px-3.5 py-3">
              {METHOD_TYPES.map((t) => (
                <label key={t} className="flex items-center gap-2 text-sm text-foreground">
                  <Checkbox checked={methodTypes.includes(t)} onCheckedChange={() => toggle(setMethodTypes, t)} />
                  {t.replace(/_/g, " ").toLowerCase()}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Must be backed by a matching capability (e.g. CARD needs a card capability).</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Supported currencies</Label>
            <Input
              value={currencies}
              onChange={(e) => setCurrencies(e.target.value)}
              className="rounded-xl text-sm font-mono"
              placeholder="KES, UGX, USD"
            />
            <p className="text-xs text-muted-foreground">Comma-separated ISO-4217 codes. Leave blank if unrestricted.</p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Description (optional)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-20 text-sm" />
          </div>
        </div>

        <SheetFooter className="flex-row justify-end gap-2 border-t border-border">
          <Button type="button" variant="outline" className="rounded-full" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="button"
            className="rounded-full gap-1.5 shadow-sm"
            disabled={pending || !name.trim() || (!isEdit && !code.trim()) || capabilities.length === 0}
            onClick={submit}
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {pending ? "Saving…" : isEdit ? "Save changes" : "Create provider"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
