"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Loader2, Plus, Pencil, ArrowDownToLine, ArrowUpFromLine } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet"
import type { PaymentMethod, PaymentDirection, CountryPaymentMethodConfig } from "@/types"

interface Props {
  countryId: string
  /** Active global catalog entries — the pool a new method can be picked from. */
  methods: PaymentMethod[]
  /** Pass to open in edit mode for an already-configured method. */
  existing?: CountryPaymentMethodConfig
}

/**
 * Add / edit a payment method for one country + direction. Deliberately
 * minimal: it records *that* the country offers this method and its display
 * order — nothing else. Which provider account runs it is wired on the
 * country's Finance page; credentials, settlement account and verification
 * are provider-owned (the adapter + the secrets manager / provider
 * dashboard), never entered here.
 */
export function CountryPaymentMethodSheet({ countryId, methods, existing }: Props) {
  const router = useRouter()
  const isEdit = !!existing

  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paymentMethodId, setPaymentMethodId] = useState(existing?.paymentMethodId ?? "")
  const [direction, setDirection] = useState<PaymentDirection | "">(existing?.direction ?? "")
  const [displayOrder, setDisplayOrder] = useState(String(existing?.displayOrder ?? 0))

  const selectedMethod = isEdit ? existing?.paymentMethod : methods.find((m) => m.id === paymentMethodId)
  const availableDirections = (isEdit ? [existing!.direction] : methods.find((m) => m.id === paymentMethodId)?.direction) ?? []

  function reset() {
    if (isEdit) {
      setDisplayOrder(String(existing?.displayOrder ?? 0))
    } else {
      setPaymentMethodId(""); setDirection(""); setDisplayOrder("0")
    }
    setError(null)
  }

  async function submit() {
    if (!isEdit && (!paymentMethodId || !direction)) return
    setError(null)
    setPending(true)
    try {
      const order = Number.parseInt(displayOrder, 10)
      const res = isEdit
        ? await fetch(`/api/payment-methods/country-config/${existing!.id}`, {
            method : "PATCH",
            headers: { "Content-Type": "application/json" },
            body   : JSON.stringify({ displayOrder: Number.isFinite(order) ? order : 0 }),
          })
        : await fetch("/api/payment-methods/country-config", {
            method : "POST",
            headers: { "Content-Type": "application/json" },
            body   : JSON.stringify({
              countryId, paymentMethodId, direction,
              displayOrder: Number.isFinite(order) ? order : 0,
            }),
          })
      const data = await res.json()
      if (res.ok) {
        toast.success(isEdit ? "Payment method updated" : "Payment method added")
        setOpen(false)
        reset()
        router.refresh()
      } else {
        setError(data.message ?? "Something went wrong.")
      }
    } catch {
      setError("Network error. Please try again.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset() }}>
      {isEdit ? (
        <Button type="button" variant="outline" size="sm" className="gap-1 rounded-full text-xs" onClick={() => setOpen(true)}>
          <Pencil className="h-3 w-3" /> Edit
        </Button>
      ) : (
        <Button type="button" size="sm" className="gap-1.5 rounded-full" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Add payment method
        </Button>
      )}

      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit payment method" : "Add a payment method"}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? "Method and direction can't be changed — they're the identity of this row and vendors' payout accounts reference it. To change direction, deactivate this and add the other direction separately."
              : "Enables one method for this country in one direction — inbound (customers pay with it) or outbound (vendors are paid out with it)."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="space-y-1.5">
            <Label className="text-xs">Payment method{isEdit ? "" : " *"}</Label>
            {isEdit ? (
              <p className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-sm text-foreground">
                {selectedMethod?.name}
              </p>
            ) : (
              <Select value={paymentMethodId} onValueChange={(v) => { setPaymentMethodId(v); setDirection("") }}>
                <SelectTrigger className="w-full rounded-xl text-sm">
                  <SelectValue placeholder={methods.length === 0 ? "No active methods in the catalog" : "Select…"} />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {methods.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Direction{isEdit ? "" : " *"}</Label>
            {isEdit ? (
              <p className="flex items-center gap-1.5 rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-sm text-foreground">
                {existing!.direction === "INBOUND"
                  ? <><ArrowDownToLine className="h-3.5 w-3.5 text-muted-foreground" />Inbound — customer payments</>
                  : <><ArrowUpFromLine className="h-3.5 w-3.5 text-muted-foreground" />Outbound — vendor payouts</>}
              </p>
            ) : (
              <Select value={direction} onValueChange={(v) => setDirection(v as PaymentDirection)} disabled={!selectedMethod}>
                <SelectTrigger className="w-full rounded-xl text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent className="rounded-xl">
                  {availableDirections.includes("INBOUND") && <SelectItem value="INBOUND">Inbound — customer payments</SelectItem>}
                  {availableDirections.includes("OUTBOUND") && <SelectItem value="OUTBOUND">Outbound — vendor payouts</SelectItem>}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Display order</Label>
            <Input
              type="number"
              value={displayOrder}
              onChange={(e) => setDisplayOrder(e.target.value)}
              className="rounded-xl text-sm"
            />
            <p className="text-xs text-muted-foreground">Lower numbers show first to customers / vendors.</p>
          </div>

          <div className="rounded-xl border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
            The provider that executes this method (and its credentials / settlement account) is configured on the
            country&apos;s <span className="text-foreground">Finance</span> page, not here.
          </div>
        </div>

        <SheetFooter className="flex-row justify-end gap-2 border-t border-border">
          <Button type="button" variant="outline" className="rounded-full" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            type="button"
            className="gap-1.5 rounded-full"
            disabled={pending || (!isEdit && (!paymentMethodId || !direction))}
            onClick={submit}
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {pending ? "Saving…" : isEdit ? "Save changes" : "Add method"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
