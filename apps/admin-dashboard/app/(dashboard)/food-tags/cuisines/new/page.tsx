import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { AdminPermissions } from "@repo/types/admin-app"

import { CuisineFieldsForm } from "@/components/food-tags/CuisineFieldsForm"
import { getAdminSession } from "@/lib/auth/session"

export const metadata: Metadata = { title: "New cuisine" }

/*
 * Creating a cuisine.
 *
 * Catalogue fields only. The picture is added on the next screen, because an
 * upload has to attach to a row that exists — and threading cuisine-only
 * imagery through the create that Cuisine and DietaryTag share would put dead
 * branches in every dietary-tag call.
 *
 * Gated on GLOBAL scope as well as the write permission, matching what the
 * backend enforces: a country-scoped admin curates which cuisines their market
 * offers, they do not invent platform vocabulary. Redirecting rather than
 * rendering a form that could only ever 403.
 */
export default async function NewCuisinePage() {
  const session = await getAdminSession()

  const canManageCatalog =
    session.permissions.includes(AdminPermissions.SETTINGS_FOOD_TAGS_WRITE) &&
    session.scope.isGlobal

  if (!canManageCatalog) redirect("/food-tags/cuisines")

  return (
    <div className="space-y-5">
      <Link
        href="/food-tags/cuisines"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        All cuisines
      </Link>

      <div>
        <h1 className="text-lg font-semibold">New cuisine</h1>
        <p className="text-sm text-muted-foreground">
          Added to the global catalogue. Each country then chooses whether to offer it, and you
          give it a picture on the next screen.
        </p>
      </div>

      <section className="admin-card">
        <CuisineFieldsForm />
      </section>
    </div>
  )
}
