import { redirect } from "next/navigation"

/** Outlets moved to /outlets (2026-09-10) — see the sibling list redirect. */
export default async function LegacyOutletDetailRedirect({
  params,
}: {
  params: Promise<{ outletId: string }>
}) {
  const { outletId } = await params
  redirect(`/outlets/${outletId}`)
}
