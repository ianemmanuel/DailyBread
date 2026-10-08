import { redirect } from "next/navigation"

/* Moved to /meals/listings/[mealId] (Phase 2.1). */
export default async function LegacyListingRedirect({ params }: { params: Promise<{ mealId: string }> }) {
  const { mealId } = await params
  redirect(`/meals/listings/${mealId}`)
}
