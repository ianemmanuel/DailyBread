import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Globe2, ImageOff, Pencil, Store } from "lucide-react"
import { AdminPermissions } from "@repo/types/admin-app"

import { FoodTagStatusActions } from "@/components/food-tags/FoodTagStatusActions"
import { Button } from "@/components/ui/button"
import { adminFetch } from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import type { TaxonomyStatus } from "@/types/food-tag.types"

export const metadata: Metadata = { title: "Cuisine" }

/*
 * THE DETAILS PAGE — read-only, and a separate route from the image form.
 *
 * Same shape and the same reasons as /marketing/[promotionId]: the common
 * case is LOOKING at a cuisine, and as its own route that ships no uploader,
 * no file-picker code and no client JS at all. Editing is a step from here.
 *
 * Reading is not scope-filtered — a cuisine is platform vocabulary every
 * vendor and customer can already see, and a country lead who cannot read the
 * catalogue cannot curate their market from it. Writing stays global-only,
 * and the backend decides that, not this page.
 */

interface CuisineDetail {
  id: string
  code: string
  slug: string
  name: string
  description: string | null
  status: TaxonomyStatus
  vendorCount: number
  hasImage: boolean
  hasOriginal: boolean
  image: {
    url: string
    width: number | null
    height: number | null
    blurDataUrl: string | null
    alt: string | null
  } | null
  countries: Array<{ id: string; name: string; slug: string; code: string }>
  createdAt: string
  updatedAt: string
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  )
}

export default async function CuisineDetailsPage({
  params,
}: {
  params: Promise<{ cuisineSlug: string }>
}) {
  const { cuisineSlug } = await params

  let cuisine: CuisineDetail
  try {
    cuisine = await adminFetch<CuisineDetail>(
      `/admin/v1/food-tags/cuisines/${cuisineSlug}/detail`,
      { cache: "no-store" },
    )
  } catch {
    notFound()
  }

  /*
   * Catalogue writes are GLOBAL-only in the backend, so a country-scoped admin
   * holding the write key would still 403. The controls are not rendered
   * rather than rendered-then-refused — the same reasoning the list page uses,
   * and the backend remains the thing that actually decides.
   */
  const session = await getAdminSession()
  const canManageCatalog =
    session.permissions.includes(AdminPermissions.SETTINGS_FOOD_TAGS_WRITE) &&
    session.scope.isGlobal

  const statusBadge =
    cuisine.status === "ACTIVE" ? "badge-success"
      : cuisine.status === "SUSPENDED" ? "badge-warning"
      : "badge-danger"

  return (
    <div className="space-y-5">
      <Link
        href="/food-tags/cuisines"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        All cuisines
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold">{cuisine.name}</h1>
            {/* The page says what state it is in before offering to change it. */}
            <span className={statusBadge}>{cuisine.status.toLowerCase()}</span>
          </div>
          <p className="text-sm text-muted-foreground">
            How this cuisine appears in the storefront, and where it is offered.
          </p>
        </div>

        {canManageCatalog && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {/* "Edit image" was misleading once this page grew a details form:
                the edit route now changes the name and description too. One
                primary action, named for what it actually does. */}
            <Button asChild size="lg">
              <Link href={`/food-tags/cuisines/${cuisine.slug}/edit`}>
                <Pencil className="size-4" />
                Edit
              </Link>
            </Button>
            <FoodTagStatusActions
              kind="cuisines"
              singular="cuisine"
              presentation="prominent"
              tag={{
                id         : cuisine.id,
                name       : cuisine.name,
                status     : cuisine.status,
                vendorCount: cuisine.vendorCount,
              }}
            />
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <section className="admin-card space-y-3">
            <h2 className="text-sm font-semibold">Image</h2>
            {cuisine.image ? (
              <div className="flex flex-wrap items-start gap-4">
                {/* Circular, matching how the storefront renders it. */}
                <div className="relative size-28 shrink-0 overflow-hidden rounded-full border border-border">
                  <Image
                    src={cuisine.image.url}
                    alt={cuisine.image.alt ?? ""}
                    fill
                    sizes="112px"
                    className="object-cover"
                  />
                </div>
                <div className="min-w-0 space-y-2">
                  <Field label="Description">
                    {cuisine.image.alt || <span className="text-muted-foreground">Not set</span>}
                  </Field>
                  <p className="text-xs text-muted-foreground">
                    {cuisine.image.width} × {cuisine.image.height}, served as WebP or AVIF
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <ImageOff className="size-4" />
                No image yet — the storefront shows a plain initial tile instead.
              </div>
            )}
          </section>

          <section className="admin-card space-y-4">
            <h2 className="text-sm font-semibold">Catalogue</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name">{cuisine.name}</Field>
              <Field label="Code">
                <code className="text-xs">{cuisine.code}</code>
              </Field>
              <Field label="Slug">
                <code className="text-xs">{cuisine.slug}</code>
              </Field>
            </div>
            <Field label="Description">
              {cuisine.description || <span className="text-muted-foreground">Not set</span>}
            </Field>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="admin-card flex items-center gap-3 py-4">
            <div className="icon-badge icon-badge-primary h-10 w-10">
              <Store className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-semibold text-foreground">{cuisine.vendorCount}</p>
              <p className="truncate text-xs text-muted-foreground">
                {cuisine.vendorCount === 1 ? "vendor uses this" : "vendors use this"}
              </p>
            </div>
          </section>

          <section className="admin-card space-y-3">
            <h2 className="text-sm font-semibold">Offered in</h2>
            {cuisine.countries.length > 0 ? (
              <ul className="flex flex-wrap gap-1.5">
                {cuisine.countries.map((country) => (
                  <li
                    key={country.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-1 text-xs"
                  >
                    <Globe2 className="size-3 text-muted-foreground" />
                    {country.name}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No market has switched this on yet, so no customer sees it. Enable it from the
                cuisines list.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              A city page shows only the cuisines its country has switched on. The landing page
              shows the whole active catalogue, because it has no location to narrow by.
            </p>
          </section>
        </aside>
      </div>
    </div>
  )
}
