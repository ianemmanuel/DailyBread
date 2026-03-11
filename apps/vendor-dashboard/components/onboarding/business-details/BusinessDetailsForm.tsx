"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@clerk/nextjs"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import { Loader2, ArrowRight, InfoIcon, AlertTriangle, Building2, User, MapPin, Phone } from "lucide-react"
import { Button } from "@repo/ui/components/button"
import { Input } from "@repo/ui/components/input"
import { Alert, AlertDescription } from "@repo/ui/components/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/alert-dialog"
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@repo/ui/components/form"

import { SearchableSelect } from "@/components/onboarding/business-details"
import { businessDetailsSchema, BusinessDetailsFormData } from "@/lib/validations/onboarding"
import type { Application, Country, VendorType } from "@repo/types"
import { toast } from "sonner"

interface Props {
  application: Application | null
  countries: Country[]
  hasDocuments: boolean
}

export function BusinessDetailsForm({ application, countries, hasDocuments }: Props) {
  const router = useRouter()
  const { getToken } = useAuth()

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [vendorTypes, setVendorTypes] = useState<VendorType[]>([])
  const [loadingVendorTypes, setLoadingVendorTypes] = useState(false)
  const [showOtherVendorType, setShowOtherVendorType] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogMessage, setDialogMessage] = useState("")
  const pendingChange = useRef<{ field: "countryId" | "vendorTypeId"; value: string } | null>(null)

  const form = useForm<BusinessDetailsFormData>({
    resolver: zodResolver(businessDetailsSchema),
    defaultValues: {
      countryId:          application?.countryId ?? "",
      vendorTypeId:       application?.vendorTypeId ?? "",
      otherVendorType:    application?.otherVendorType ?? "",
      legalBusinessName:  application?.legalBusinessName ?? "",
      registrationNumber: application?.registrationNumber ?? "",
      taxId:              application?.taxId ?? "",
      businessEmail:      application?.businessEmail ?? "",
      businessPhone:      application?.businessPhone ?? "",
      ownerFirstName:     application?.ownerFirstName ?? "",
      ownerLastName:      application?.ownerLastName ?? "",
      ownerEmail:         application?.ownerEmail ?? "",
      ownerPhone:         application?.ownerPhone ?? "",
      businessAddress:    application?.businessAddress ?? "",
      addressLine2:       application?.addressLine2 ?? "",
      postalCode:         application?.postalCode ?? "",
    },
  })

  const countryId = form.watch("countryId")
  const vendorTypeId = form.watch("vendorTypeId")

  // ── Country/vendorType change interception ────────────────────────────────
  function handleCountryChange(newValue: string) {
    if (hasDocuments && newValue !== application?.countryId) {
      pendingChange.current = { field: "countryId", value: newValue }
      setDialogMessage(
        "Changing your country will delete all uploaded documents because document requirements differ per country. This cannot be undone."
      )
      setDialogOpen(true)
      return
    }
    form.setValue("countryId", newValue)
  }

  function handleVendorTypeChange(newValue: string) {
    if (hasDocuments && newValue !== application?.vendorTypeId) {
      pendingChange.current = { field: "vendorTypeId", value: newValue }
      setDialogMessage(
        "Changing your vendor type will delete all uploaded documents because document requirements differ per vendor type. This cannot be undone."
      )
      setDialogOpen(true)
      return
    }
    form.setValue("vendorTypeId", newValue)
  }

  function handleDialogConfirm() {
    setTimeout(() => {
      if (!pendingChange.current) return
      const { field, value } = pendingChange.current
      form.setValue(field, value)
      if (field === "countryId") form.setValue("vendorTypeId", "")
      pendingChange.current = null
    }, 0)
  }

  function handleDialogCancel() {
    pendingChange.current = null
  }

  // ── Fetch vendor types when country changes ────────────────────────────────
  useEffect(() => {
    if (!countryId) {
      setVendorTypes([])
      form.setValue("vendorTypeId", "")
      return
    }

    const controller = new AbortController()
    setLoadingVendorTypes(true)

    async function fetchVendorTypes() {
      try {
        const res = await fetch(`/api/onboarding/vendor-types?countryId=${countryId}`, {
          signal: controller.signal,
        })
        const json = await res.json()
        if (json.status !== "success") throw new Error(json.message)

        const types: VendorType[] = json.data?.vendorTypes ?? []
        setVendorTypes(types)

        if (application?.vendorTypeId && types.some(t => t.id === application.vendorTypeId)) {
          form.setValue("vendorTypeId", application.vendorTypeId)
        }
      } catch (err: any) {
        if (err?.name === "AbortError") return
        setVendorTypes([])
        setError("Failed to load vendor types. Please try again.")
      } finally {
        setLoadingVendorTypes(false)
      }
    }

    fetchVendorTypes()
    return () => controller.abort()
  }, [countryId, application, form])

  // ── Show "Other" input ─────────────────────────────────────────────────────
  useEffect(() => {
    const selected = vendorTypes.find(t => t.id === vendorTypeId)
    const isOther = selected?.name?.toLowerCase() === "other"
    setShowOtherVendorType(isOther)
    if (!isOther) form.setValue("otherVendorType", "")
  }, [vendorTypeId, vendorTypes, form])

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function onSubmit(values: BusinessDetailsFormData) {
    setError(null)
    setIsSubmitting(true)

    try {
      const token = await getToken()
      if (!token) {
        setError("Authentication error. Please refresh and try again.")
        return
      }

      const res = await fetch("/api/onboarding/application", {
        method: "POST",
        body: JSON.stringify(values),
      })

      const data = await res.json()

      if (!res.ok || data.status !== "success") {
        const message = res.status < 500
          ? data?.message || "Please check your details and try again."
          : "Something went wrong. Please try again."
        console.error("[BusinessDetailsForm] submit error:", data)
        setError(message)
        return
      }

      toast.success("Business details saved")
      router.push("/onboarding/documents")
    } catch (err: any) {
      console.error("[BusinessDetailsForm] unexpected error:", err)
      setError("Something went wrong. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  // ── Build select options ───────────────────────────────────────────────────
  const countryOptions = countries.map(c => ({
    value: c.id,
    label: c.name,
    sublabel: c.code ?? undefined, // e.g. "+254"
  }))

  const vendorTypeOptions = vendorTypes.map(v => ({
    value: v.id,
    label: v.name,
  }))

  return (
    <>
      {/* Document-deletion warning dialog */}
      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Your documents will be deleted
            </AlertDialogTitle>
            <AlertDialogDescription>{dialogMessage}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleDialogCancel}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDialogConfirm}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              Yes, delete documents & continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/*
        Break out of the layout's max-w-2xl by using negative margins + explicit wider max-width.
        This keeps the navbar/footer at 2xl but gives the form more breathing room.
      */}
      <div className="-mx-4 sm:-mx-6 lg:-mx-8 xl:-mx-16">
        <div className="mx-auto w-full max-w-4xl px-4 sm:px-6">

          {/* Page title */}
          <div className="mb-6">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Business Details</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Tell us about your business. All fields marked * are required.
            </p>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

              {error && (
                <Alert variant="destructive">
                  <InfoIcon className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {/* ── Card: Business Registration ─────────────────────────── */}
              <FormCard
                icon={<Building2 className="h-4 w-4" />}
                title="Business Registration"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-5 gap-y-5">

                  {/* Country — full width on mobile, spans 1 col on wider */}
                  <FormField
                    control={form.control}
                    name="countryId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Country *</FormLabel>
                        <FormControl>
                          <SearchableSelect
                            options={countryOptions}
                            value={field.value}
                            onValueChange={handleCountryChange}
                            placeholder="Select country"
                            searchPlaceholder="Search countries..."
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Vendor Type */}
                  <FormField
                    control={form.control}
                    name="vendorTypeId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Vendor Type *</FormLabel>
                        <FormControl>
                          <SearchableSelect
                            options={vendorTypeOptions}
                            value={field.value}
                            onValueChange={handleVendorTypeChange}
                            placeholder={
                              !countryId ? "Select country first"
                              : loadingVendorTypes ? "Loading..."
                              : "Select vendor type"
                            }
                            searchPlaceholder="Search types..."
                            disabled={!countryId || loadingVendorTypes}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Other vendor type — conditional */}
                  {showOtherVendorType && (
                    <FormField
                      control={form.control}
                      name="otherVendorType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Specify Vendor Type *</FormLabel>
                          <FormControl><Input placeholder="e.g. Food truck" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {/* Legal business name — full row */}
                  <FormField
                    control={form.control}
                    name="legalBusinessName"
                    render={({ field }) => (
                      <FormItem className="sm:col-span-2 xl:col-span-3">
                        <FormLabel>Legal Business Name *</FormLabel>
                        <FormControl><Input placeholder="As registered with government" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="registrationNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Registration Number</FormLabel>
                        <FormControl><Input placeholder="Optional" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="taxId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tax ID / VAT Number</FormLabel>
                        <FormControl><Input placeholder="Optional" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                </div>
              </FormCard>

              {/* ── Card: Business Contact ───────────────────────────────── */}
              <FormCard
                icon={<Phone className="h-4 w-4" />}
                title="Business Contact"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-5">
                  <FormField
                    control={form.control}
                    name="businessEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Business Email *</FormLabel>
                        <FormControl><Input type="email" placeholder="hello@yourbusiness.com" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="businessPhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Business Phone</FormLabel>
                        <FormControl><Input placeholder="+1 555 000 0000" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </FormCard>

              {/* ── Card: Owner Information ──────────────────────────────── */}
              <FormCard
                icon={<User className="h-4 w-4" />}
                title="Owner Information"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-x-5 gap-y-5">
                  <FormField
                    control={form.control}
                    name="ownerFirstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Name *</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="ownerLastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last Name *</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="ownerEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Owner Email</FormLabel>
                        <FormControl><Input type="email" placeholder="Optional" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="ownerPhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Owner Phone</FormLabel>
                        <FormControl><Input placeholder="Optional" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </FormCard>

              {/* ── Card: Business Address ───────────────────────────────── */}
              <FormCard
                icon={<MapPin className="h-4 w-4" />}
                title="Business Address"
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-5 gap-y-5">
                  <FormField
                    control={form.control}
                    name="businessAddress"
                    render={({ field }) => (
                      <FormItem className="sm:col-span-3">
                        <FormLabel>Street Address *</FormLabel>
                        <FormControl><Input placeholder="123 Main St" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="addressLine2"
                    render={({ field }) => (
                      <FormItem className="sm:col-span-2">
                        <FormLabel>Address Line 2</FormLabel>
                        <FormControl><Input placeholder="Suite, floor, unit... (optional)" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="postalCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Postal Code</FormLabel>
                        <FormControl><Input placeholder="00100" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </FormCard>

              {/* ── Footer ──────────────────────────────────────────────── */}
              <div className="flex justify-end pt-2 pb-8">
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  size="lg"
                  className="min-w-40"
                >
                  {isSubmitting
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
                    : <>Save & Continue <ArrowRight className="ml-2 h-4 w-4" /></>
                  }
                </Button>
              </div>

            </form>
          </Form>
        </div>
      </div>
    </>
  )
}

// ── Card wrapper ──────────────────────────────────────────────────────────────

function FormCard({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      {/* Card header */}
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-border bg-muted/30">
        <span className="text-muted-foreground">{icon}</span>
        <h2 className="text-sm font-medium text-foreground tracking-tight">{title}</h2>
      </div>
      {/* Card body */}
      <div className="px-5 py-5">
        {children}
      </div>
    </div>
  )
}