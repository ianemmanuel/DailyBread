import { redirect } from "next/navigation"

/* Moved to /meals/dishes/[menuItemId] (Phase 2.1). */
export default async function LegacyDishRedirect({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params
  redirect(`/meals/dishes/${itemId}`)
}
