"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { ClerkLoading, Show, SignInButton } from "@clerk/nextjs"
import { AlertCircle, ArrowRight, BookmarkPlus, Check, Loader2, MapPin } from "lucide-react"
import type { CustomerAddress, Serviceability } from "@repo/types/customer-app"

import { Button } from "@/components/ui/button"
import {
  Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { clientFetch } from "@/lib/api/client"
import { customerErrorMessage } from "@/lib/api/error-copy"
import { addressFormSchema, type AddressFormValues } from "@/lib/validation/address"

/*
 * "Save this address" — the auth wall, placed where the commitment is.
 *
 * ── Why HERE and not in front of the map ───────────────────────────────────
 *
 * Setting a delivery point is public: it writes only a session cookie and
 * nothing durable, so gating it would put a sign-in wall in front of every
 * price and delivery time. SAVING is different — a durable record needs a
 * person to own it. So the map stays open and this appears under a CONFIRMED
 * pin, the first moment an account buys the customer anything.
 *
 * Signed out it is an invitation, not a dead end: Clerk keeps the current URL
 * as `redirect_url` and returns them to this page.
 *
 * ── The typed lines are for the COURIER; the pin is the destination ────────
 *
 * The server derives country and the real city from the coordinates and
 * refuses a country that contradicts them. Nothing typed here moves the food —
 * it is what gets it from the right building to the right door, which is why
 * the placeholders show the SHAPE of a useful answer ("Apartment 3B, green
 * gate") rather than repeating the label.
 *
 * ── Validation is a courtesy, never a decision ─────────────────────────────
 *
 * zod mirrors the backend's own limits so a mistake is a message under the
 * field instead of a round trip. The backend re-checks every one of them
 * (principle 1), and its refusals are translated by `customerErrorMessage` —
 * "Unauthorized" is true and useless; "Please sign in to save this address" is
 * what the person can act on.
 */

interface Point { latitude: number; longitude: number }

type Phase =
  | { step: "idle" }
  | { step: "saved"; address: CustomerAddress }
  | { step: "error"; message: string }

export function SaveAddressPanel({
  point,
  serviceability,
  cityName,
  citySlug,
}: {
  point         : Point
  serviceability: Serviceability
  /** The market being browsed — only a default for the printed city line,
   *  which the customer can correct. It decides nothing. */
  cityName      : string
  citySlug      : string
}) {
  const router = useRouter()
  const [phase, setPhase] = React.useState<Phase>({ step: "idle" })

  const form = useForm<AddressFormValues>({
    resolver: zodResolver(addressFormSchema),
    /* Validate once a field has been touched rather than on every keystroke:
     * shouting at someone halfway through typing their street is noise. */
    mode: "onTouched",
    defaultValues: {
      label       : "",
      addressLine1: "",
      addressLine2: "",
      /* The resolved city, not the browsed one, when the backend knows it —
       * the pin may well be in a different city than the page. */
      city        : serviceability.cityName ?? cityName,
      postalCode  : "",
    },
  })

  async function onSubmit(values: AddressFormValues) {
    setPhase({ step: "idle" })
    try {
      const address = await clientFetch<CustomerAddress>("/api/account/addresses", {
        method: "POST",
        body  : JSON.stringify({
          label       : values.label || null,
          addressLine1: values.addressLine1,
          addressLine2: values.addressLine2 || null,
          city        : values.city,
          postalCode  : values.postalCode || null,
          latitude    : point.latitude,
          longitude   : point.longitude,
        }),
      })

      /* Saving it also selects it: they just pinned this spot and confirmed
       * it, so asking them to choose it again in the address book would be the
       * same question twice. The cookie write is server-side, from the
       * backend's own read of the row. */
      await clientFetch("/api/location/address", {
        method: "POST",
        body  : JSON.stringify({ addressId: address.id }),
      }).catch(() => null)

      setPhase({ step: "saved", address })
      router.refresh()
    } catch (err) {
      setPhase({ step: "error", message: customerErrorMessage(err, "We couldn't save that address.") })
    }
  }

  if (phase.step === "saved") {
    /*
     * What someone wants NEXT, in the order they want it.
     *
     * Browsing is the reason they set an address at all, so it is the primary
     * action. Saving ANOTHER address is a real need — but the map to do it on
     * is the one already on this page, so "Pin somewhere else" resets this
     * panel rather than sending them away and back. Managing the book is a
     * genuine destination, so it is a button and not a sentence: on a tinted
     * panel a ghost link reads as body text and gets missed.
     */
    return (
      <div className="space-y-3 rounded-2xl border border-success/30 bg-success/10 p-4">
        <div className="space-y-1">
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Check aria-hidden className="size-4 text-success" />
            Saved as {phase.address.label ?? phase.address.addressLine1}
          </p>
          <p className="text-sm text-muted-foreground">
            We&apos;ll deliver here unless you choose another address.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild className="h-10 rounded-full px-5">
            <Link href={`/city/${serviceability.citySlug ?? citySlug}/places`}>
              Browse places
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          </Button>

          <Button
            type="button"
            variant="brand"
            className="h-10 rounded-full px-4"
            onClick={() => {
              form.reset({
                label: "", addressLine1: "", addressLine2: "",
                city: serviceability.cityName ?? cityName, postalCode: "",
              })
              setPhase({ step: "idle" })
            }}
          >
            <MapPin aria-hidden className="size-4" />
            Pin somewhere else
          </Button>

          <Button asChild variant="outline" className="h-10 rounded-full px-4">
            <Link href="/account/addresses">Manage addresses</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <ClerkLoading>
        <div className="shimmer h-11 w-full rounded-xl" />
      </ClerkLoading>

      <Show when="signed-out">
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <BookmarkPlus aria-hidden className="size-4 text-primary-text" />
            Save this address for next time
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            We&apos;re already delivering here for now — sign in to keep it, and
            we&apos;ll bring you straight back to this map.
          </p>
          <SignInButton>
            <Button variant="brand" className="h-11 w-full rounded-xl">
              Sign in to save
            </Button>
          </SignInButton>
        </div>
      </Show>

      <Show when="signed-in">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <p className="flex items-center gap-2 text-sm font-medium text-foreground">
              <BookmarkPlus aria-hidden className="size-4 text-primary-text" />
              Save this address
            </p>

            <FormField
              control={form.control}
              name="addressLine1"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Street, building or landmark</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Rhapta Road, Cove Court"
                      autoComplete="address-line1"
                      className="h-11 text-base sm:text-sm"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="addressLine2"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Apartment, floor or delivery note
                    <span className="ml-1 font-normal text-muted-foreground">(optional)</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="Apartment 3B, green gate, ask for John"
                      autoComplete="address-line2"
                      className="h-11 text-base sm:text-sm"
                    />
                  </FormControl>
                  <FormDescription>
                    The pin gets the rider to the building — this gets them to your door.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>City</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Nairobi"
                        autoComplete="address-level2"
                        className="h-11 text-base sm:text-sm"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="label"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Name it
                      <span className="ml-1 font-normal text-muted-foreground">(optional)</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Home, Work, Mum's place"
                        className="h-11 text-base sm:text-sm"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {phase.step === "error" && (
              <p role="status" className="flex items-start gap-2 text-sm text-muted-foreground">
                <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
                {phase.message}
              </p>
            )}

            <Button
              type="submit"
              disabled={form.formState.isSubmitting}
              className="h-11 w-full rounded-xl"
            >
              {form.formState.isSubmitting && <Loader2 aria-hidden className="size-4 animate-spin" />}
              {form.formState.isSubmitting ? "Saving…" : "Save address"}
            </Button>
          </form>
        </Form>
      </Show>
    </div>
  )
}
