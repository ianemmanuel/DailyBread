import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { CuisineFieldsForm } from "@/components/food-tags/CuisineFieldsForm"
import { CuisineImageForm } from "@/components/food-tags/CuisineImageForm"
import { adminFetch } from "@/lib/api"

export const metadata: Metadata = { title: "Edit cuisine" }

/*
 * The edit form, on its own route.
 *
 * An ordinary visit loads only the read-only details page; the uploader, the
 * file picker and the client JS they need live here and are paid for only by
 * someone actually editing. Same split as /marketing/[promotionId]/edit.
 *
 * Whether this admin may WRITE is the backend's decision — catalogue content
 * needs GLOBAL scope. A country-scoped admin can open this page and is refused
 * on save with a 403 that says why. That is deliberate: re-deriving an
 * authorization rule in the browser gives you two implementations of one rule,
 * and they always drift.
 */

interface CuisineDetail {
  id: string
  code: string
  slug: string
  name: string
  description: string | null
  image: { url: string; alt: string | null } | null
}

export default async function EditCuisinePage({
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

  return (
    <div className="space-y-5">
      <Link
        href={`/food-tags/cuisines/${cuisine.slug}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Back to {cuisine.name}
      </Link>

      <div>
        <h1 className="text-lg font-semibold">Edit cuisine</h1>
        <p className="text-sm text-muted-foreground">{cuisine.name}</p>
      </div>

      <section className="admin-card space-y-4">
        <h2 className="text-sm font-semibold">Details</h2>
        <CuisineFieldsForm
          cuisine={{
            id         : cuisine.id,
            slug       : cuisine.slug,
            code       : cuisine.code,
            name       : cuisine.name,
            description: cuisine.description,
          }}
        />
      </section>

      <section className="admin-card space-y-4">
        <h2 className="text-sm font-semibold">Picture</h2>
        {/* Saves on its own, separately from the fields above: an upload that
            only landed when some other form was submitted would be lost by a
            navigation, and there is nothing here that has to change together. */}
        <CuisineImageForm
          slug={cuisine.slug}
          currentUrl={cuisine.image?.url ?? null}
          currentAlt={cuisine.image?.alt ?? null}
        />
      </section>
    </div>
  )
}
