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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet"
import type { PaymentMethod, PaymentMethodType, PaymentDirection } from "@/types"

interface Props {
  /** Omit for create mode, pass the payment method for edit mode. */
  paymentMethod?: PaymentMethod
}

const TYPE_OPTIONS: { value: PaymentMethodType; label: string }[] = [
  { value: "MOBILE_MONEY",   label: "Mobile Money" },
  { value: "BANK",           label: "Bank" },
  { value: "DIGITAL_WALLET", label: "Digital Wallet" },
  { value: "CARD",           label: "Card" },
]

/**
 * Create/edit a global payment-method catalog entry — the platform-wide
 * definition (Roadmap "Payment gateway infrastructure", CLAUDE.md). Per-
 * country activation/configuration (our account details, verification
 * provider) happens on /countries/[slug]/payment-methods, not here — this
 * Sheet only manages what the method IS, not whether/how any country
 * uses it. Code is immutable after creation (it's the stable identifier
 * VendorPayoutAccount-adjacent code elsewhere may reference).
 */
export function PaymentMethodFormSheet({ paymentMethod }: Props) {
  const router = useRouter()
  const isEdit = !!paymentMethod

  const [open, setOpen] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [code, setCode] = useState(paymentMethod?.code ?? "")
  const [name, setName] = useState(paymentMethod?.name ?? "")
  const [type, setType] = useState<PaymentMethodType>(paymentMethod?.type ?? "MOBILE_MONEY")
  const [direction, setDirection] = useState<PaymentDirection[]>(paymentMethod?.direction ?? ["INBOUND", "OUTBOUND"])
  const [logoUrl, setLogoUrl] = useState(paymentMethod?.logoUrl ?? "")
  const [description, setDescription] = useState(paymentMethod?.description ?? "")

  function toggleDirection(d: PaymentDirection) {
    setDirection((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d])
  }

  async function submit() {
    if (!name.trim() || (!isEdit && !code.trim()) || direction.length === 0) return
    setFormError(null)
    setPending(true)
    try {
      const res = await fetch(isEdit ? `/api/payment-methods/${paymentMethod.code}` : "/api/payment-methods", {
        method : isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify(isEdit
          ? { name: name.trim(), type, direction, logoUrl: logoUrl.trim() || undefined, description: description.trim() || undefined }
          : { code: code.trim(), name: name.trim(), type, direction, logoUrl: logoUrl.trim() || undefined, description: description.trim() || undefined }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(isEdit ? "Payment method updated" : "Payment method created")
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
        <Button
          type="button" size="sm" className="gap-1.5 rounded-full shadow-sm"
          style={{ backgroundImage: "linear-gradient(135deg, var(--primary), color-mix(in oklch, var(--primary) 82%, black 12%))" }}
          onClick={() => setOpen(true)}
        >
          <Plus className="h-4 w-4" />
          New Payment Method
        </Button>
      )}

      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit payment method" : "New payment method"}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? "Update the catalog definition. Activating it per country happens on that country's payment methods page."
              : "Adds a platform-wide catalog entry (e.g. M-Pesa, Stripe). It won't be usable in any country until configured there."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {formError && <p className="text-sm text-destructive">{formError}</p>}

          {!isEdit && (
            <div className="space-y-1.5">
              <Label className="text-xs">Code *</Label>
              <Input placeholder="e.g. MPESA" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="rounded-xl text-sm font-mono" autoFocus />
              <p className="text-xs text-muted-foreground">Stable identifier — can't be changed after creation.</p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Name *</Label>
            <Input placeholder="e.g. M-Pesa" value={name} onChange={(e) => setName(e.target.value)} className="rounded-xl text-sm" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Type *</Label>
            <Select value={type} onValueChange={(v) => setType(v as PaymentMethodType)}>
              <SelectTrigger className="w-full rounded-xl text-sm"><SelectValue /></SelectTrigger>
              <SelectContent className="rounded-xl">
                {TYPE_OPTIONS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Direction * (at least one)</Label>
            <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-muted/20 px-3.5 py-3">
              <label className="flex items-center gap-2 text-sm text-foreground">
                <Checkbox checked={direction.includes("INBOUND")} onCheckedChange={() => toggleDirection("INBOUND")} />
                Inbound — customers can pay with this
              </label>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <Checkbox checked={direction.includes("OUTBOUND")} onCheckedChange={() => toggleDirection("OUTBOUND")} />
                Outbound — vendors can be paid out with this
              </label>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Logo URL (optional)</Label>
            <Input placeholder="https://…" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} className="rounded-xl text-sm" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Description (optional)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-20 text-sm" />
          </div>
        </div>

        <SheetFooter className="flex-row justify-end gap-2 border-t border-border">
          <Button type="button" variant="outline" className="rounded-full" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          <Button
            type="button" className="rounded-full gap-1.5 shadow-sm"
            style={{ backgroundImage: "linear-gradient(135deg, var(--primary), color-mix(in oklch, var(--primary) 82%, black 12%))" }}
            disabled={pending || !name.trim() || (!isEdit && !code.trim()) || direction.length === 0}
            onClick={submit}
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {pending ? "Saving…" : isEdit ? "Save changes" : "Create payment method"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
