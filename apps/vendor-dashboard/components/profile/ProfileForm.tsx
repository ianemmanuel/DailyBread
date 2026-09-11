"use client"

import * as React from "react"
import { toast } from "sonner"
import { Loader2, Save, Store, ImageIcon, Phone, Utensils, BookOpen, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { useVendorProfile, useUpsertVendorProfile, useVendorFoodTags } from "@/lib/queries/profile"
import { ClientApiError } from "@/lib/api/client"
import { validateProfile, PROFILE_LIMITS, type ProfileFieldErrors } from "@/lib/validations/profile"
import { releasePreview } from "@/lib/profile/media"
import { ImageUploadField, type ImageValue } from "./ImageUploadField"
import { TagMultiSelect } from "./TagMultiSelect"
import { FormSection as Section, FormField as Field } from "@/components/dashboard/form"

/*
 * The vendor's public profile.
 *
 * Two things drive the shape. Images are uploaded the moment they're picked
 * and the form only ever carries storage keys — the same presign → PUT → key
 * pipeline as the application documents and the payout proof, so a vendor
 * never meets a third upload UX. And the taxonomy fields are admin-curated
 * multi-selects rather than free text, so what a vendor claims can actually be
 * filtered on and aggregated.
 *
 * Layout is two columns from `lg` and one below it, with fields at their
 * natural width — a 60-character name in a full-bleed input reads as a mistake.
 */

interface FormState {
  displayName    : string
  tagline        : string
  description    : string
  story          : string
  publicEmail    : string
  publicPhone    : string
  website        : string
  foundedYear    : string
}

const EMPTY: FormState = {
  displayName: "", tagline: "", description: "", story: "",
  publicEmail: "", publicPhone: "", website: "", foundedYear: "",
}

export function ProfileForm() {
  const { data: profile, isLoading } = useVendorProfile()
  const { data: foodTags } = useVendorFoodTags()
  const upsert = useUpsertVendorProfile()

  const [form, setForm]     = React.useState<FormState>(EMPTY)
  const [errors, setErrors] = React.useState<ProfileFieldErrors>({})

  const [logo, setLogo]         = React.useState<ImageValue | null>(null)
  const [cover, setCover]       = React.useState<ImageValue | null>(null)
  const [cuisineIds, setCuisineIds]       = React.useState<string[]>([])
  const [dietaryTagIds, setDietaryTagIds] = React.useState<string[]>([])
  const [storyOpen, setStoryOpen] = React.useState(false)

  const hydrated = React.useRef(false)

  React.useEffect(() => {
    if (!profile || hydrated.current) return
    hydrated.current = true

    setForm({
      displayName    : profile.displayName,
      tagline        : profile.tagline ?? "",
      description    : profile.description ?? "",
      story          : profile.story ?? "",
      publicEmail    : profile.publicEmail ?? "",
      publicPhone    : profile.publicPhone ?? "",
      website        : profile.website ?? "",
      foundedYear    : profile.foundedYear ? String(profile.foundedYear) : "",
    })

    // Saved images arrive as a signed URL paired with the key it came from, so
    // the form can render one and still submit the other.
    if (profile.logoStorageKey && profile.logoUrl) {
      setLogo({ storageKey: profile.logoStorageKey, url: profile.logoUrl, isLocal: false })
    }
    if (profile.coverStorageKey && profile.coverImageUrl) {
      setCover({ storageKey: profile.coverStorageKey, url: profile.coverImageUrl, isLocal: false })
    }
    setCuisineIds(profile.cuisines.map((c) => c.id))
    setDietaryTagIds(profile.dietaryTags.map((d) => d.id))
    if (profile.story) setStoryOpen(true)
  }, [profile])

  // Object URLs for previews are per-tab allocations; free them on unmount.
  React.useEffect(() => () => {
    releasePreview(logo?.url)
    releasePreview(cover?.url)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function setField<K extends keyof FormState>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
    // Clear this field's error as soon as it's touched — leaving a stale
    // message under an input the vendor is actively fixing reads as broken.
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const parsedYear = form.foundedYear.trim() ? Number(form.foundedYear) : null
    const values = {
      ...form,
      foundedYear: parsedYear !== null && Number.isNaN(parsedYear) ? undefined : parsedYear,
    }

    const found = validateProfile(values as never)
    if (found) {
      setErrors(found)
      toast.error("Please fix the highlighted fields")
      return
    }
    setErrors({})

    try {
      await upsert.mutateAsync({
        displayName    : form.displayName.trim(),
        tagline        : form.tagline.trim() || null,
        description    : form.description.trim() || null,
        story          : form.story.trim() || null,
        publicEmail    : form.publicEmail.trim() || null,
        publicPhone    : form.publicPhone.trim() || null,
        website        : form.website.trim() || null,
        foundedYear    : parsedYear,
        logoStorageKey : logo?.storageKey ?? null,
        coverStorageKey: cover?.storageKey ?? null,
        cuisineIds,
        dietaryTagIds,
      })

      // Everything is saved now, so nothing on screen is a local preview any
      // more. Marking them keeps "remove" from deleting a live image.
      setLogo((v) => (v ? { ...v, isLocal: false } : v))
      setCover((v) => (v ? { ...v, isLocal: false } : v))

      toast.success("Profile saved")
    } catch (err) {
      toast.error(err instanceof ClientApiError ? err.message : "Failed to save profile")
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <div className="grid gap-5 lg:grid-cols-2">
        {/* ── Basics ───────────────────────────────────────────────── */}
        <Section icon={Store} title="Basics" description="The name and one-liner customers see first">
          <Field
            label="Public name"
            required
            error={errors.displayName}
            hint="Your trading name — what customers search for."
          >
            <Input
              value={form.displayName}
              maxLength={PROFILE_LIMITS.displayName}
              onChange={(e) => setField("displayName", e.target.value)}
              placeholder="e.g. Manu's Kitchen"
              aria-invalid={!!errors.displayName}
            />
          </Field>

          <Field
            label="Tagline"
            error={errors.tagline}
            hint="One short line under your name."
            counter={`${form.tagline.length}/${PROFILE_LIMITS.tagline}`}
          >
            <Input
              value={form.tagline}
              maxLength={PROFILE_LIMITS.tagline}
              onChange={(e) => setField("tagline", e.target.value)}
              placeholder="Home-style Kenyan cooking, every day"
            />
          </Field>

          <Field
            label="Description"
            error={errors.description}
            hint="A short paragraph about your food and what makes it yours."
            counter={`${form.description.length}/${PROFILE_LIMITS.description}`}
          >
            <Textarea
              value={form.description}
              maxLength={PROFILE_LIMITS.description}
              rows={4}
              className="resize-none"
              onChange={(e) => setField("description", e.target.value)}
            />
          </Field>
        </Section>

        {/* ── Media ────────────────────────────────────────────────── */}
        <Section icon={ImageIcon} title="Images" description="Your logo and a cover photo">
          <ImageUploadField
            kind="logo"
            label="Logo"
            shape="square"
            hint="Square works best. Shown next to your name everywhere."
            value={logo}
            onChange={setLogo}
            disabled={upsert.isPending}
          />
          <ImageUploadField
            kind="cover"
            label="Cover photo"
            shape="wide"
            hint="A wide banner across the top of your page. Landscape works best."
            value={cover}
            onChange={setCover}
            disabled={upsert.isPending}
          />
        </Section>

        {/* ── What you serve ───────────────────────────────────────── */}
        <Section
          icon={Utensils}
          title="What you serve"
          description="How customers find you when they browse and filter"
        >
          <TagMultiSelect
            label="Cuisines"
            options={foodTags?.cuisines ?? []}
            selected={cuisineIds}
            onChange={setCuisineIds}
            max={foodTags?.maxCuisines ?? 5}
            hint="Pick the ones that genuinely describe your menu."
            emptyHint="No cuisines are available in your country yet. Our team is still setting them up — you can save the rest of your profile now."
            disabled={upsert.isPending}
          />
          <TagMultiSelect
            label="Dietary options"
            options={foodTags?.dietaryTags ?? []}
            selected={dietaryTagIds}
            onChange={setDietaryTagIds}
            max={foodTags?.maxDietaryTags ?? 8}
            hint="Only pick what you can reliably serve — customers filter on these."
            emptyHint="No dietary options are available in your country yet."
            disabled={upsert.isPending}
          />
        </Section>

        {/* ── Contact ──────────────────────────────────────────────── */}
        <Section icon={Phone} title="Contact & details" description="Optional ways for customers to reach you">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Public email" error={errors.publicEmail}>
              <Input
                type="email"
                value={form.publicEmail}
                onChange={(e) => setField("publicEmail", e.target.value)}
                placeholder="hello@example.com"
                aria-invalid={!!errors.publicEmail}
              />
            </Field>
            <Field label="Public phone" error={errors.publicPhone}>
              <Input
                value={form.publicPhone}
                onChange={(e) => setField("publicPhone", e.target.value)}
                placeholder="+254 700 000 000"
              />
            </Field>
            <Field label="Website" error={errors.website}>
              <Input
                value={form.website}
                onChange={(e) => setField("website", e.target.value)}
                placeholder="https://…"
                aria-invalid={!!errors.website}
              />
            </Field>
            <Field label="Founded" error={errors.foundedYear} hint="The year you started.">
              <Input
                type="number"
                inputMode="numeric"
                value={form.foundedYear}
                onChange={(e) => setField("foundedYear", e.target.value)}
                placeholder="2019"
                aria-invalid={!!errors.foundedYear}
              />
            </Field>
          </div>
        </Section>
      </div>

      {/* ── Story ──────────────────────────────────────────────────
          Collapsed by default. Uber Eats and DoorDash have no story field at
          all — this follows Yelp / Google Business, so it earns its place only
          for vendors who want it and never dominates the form for those who
          don't. */}
      <div className="dash-card overflow-hidden">
        <button
          type="button"
          onClick={() => setStoryOpen((v) => !v)}
          aria-expanded={storyOpen}
          className="flex w-full cursor-pointer items-center gap-3 px-5 py-4 text-left"
        >
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <BookOpen className="size-3.5 text-[var(--primary)]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[var(--foreground)]">
              Your story <span className="font-normal text-[var(--muted-foreground)]">· optional</span>
            </p>
            <p className="text-xs text-[var(--muted-foreground)]">
              The longer background — how you started, who cooks, what you&apos;re known for.
            </p>
          </div>
          <ChevronDown className={cn("size-4 shrink-0 text-[var(--muted-foreground)] transition-transform", storyOpen && "rotate-180")} />
        </button>

        {storyOpen && (
          <div className="border-t border-[var(--border)]/60 px-5 py-4">
            <Textarea
              value={form.story}
              maxLength={PROFILE_LIMITS.story}
              rows={7}
              className="resize-none"
              onChange={(e) => setField("story", e.target.value)}
              placeholder="We started in 2019 with one pot and a stall on Ngong Road…"
              aria-label="Your story"
            />
            <div className="mt-1.5 flex items-start justify-between gap-3">
              {errors.story
                ? <p className="text-xs text-[var(--destructive)]">{errors.story}</p>
                : <span />}
              <span className="shrink-0 text-xs text-[var(--muted-foreground)] tabular-nums">
                {form.story.length}/{PROFILE_LIMITS.story}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-[var(--muted-foreground)]">
          <span className="text-[var(--destructive)]">*</span> Required. Everything else is optional and can be added later.
        </p>
        <Button type="submit" disabled={upsert.isPending} className="gap-2 sm:w-auto">
          {upsert.isPending
            ? <><Loader2 className="size-4 animate-spin" />Saving…</>
            : <><Save className="size-4" />Save profile</>}
        </Button>
      </div>
    </form>
  )
}
