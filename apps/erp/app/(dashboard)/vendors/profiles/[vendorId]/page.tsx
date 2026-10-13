import type { Metadata } from "next"
import { redirect, notFound } from "next/navigation"
import { BackButton } from "@/components/shared/BackButton"
import { adminFetch, ApiCallError } from "@/lib/api"
import { getAdminSession } from "@/lib/auth/session"
import { AdminPermissions } from "@repo/types/admin-app"
import { VendorProfilePreview } from "@/components/vendors/VendorProfilePreview"
import { VendorProfileReviewPanel } from "@/components/vendors/VendorProfileReviewPanel"
import { buildSuggestedReason } from "@/components/vendors/profile-flag-meta"
import type { VendorProfileAdminDetail } from "@/types"

export const metadata: Metadata = { title: "Vendor Profile" }

interface Props { params: Promise<{ vendorId: string }> }

/**
 * One vendor's public profile, and the decision about it.
 *
 * The route is keyed on the VENDOR id, not the profile id, because a profile is
 * 1:1 with an account and every other admin surface already links by vendor —
 * so the queue, the account page and this page all address it the same way.
 */
export default async function VendorProfileDetailPage({ params }: Props) {
  const { vendorId } = await params
  const session = await getAdminSession()

  if (!session.permissions.includes(AdminPermissions.VENDORS_PROFILES_READ)) redirect("/vendors")
  const canModerate = session.permissions.includes(AdminPermissions.VENDORS_PROFILES_MODERATE)

  let profile: VendorProfileAdminDetail
  try {
    profile = await adminFetch<VendorProfileAdminDetail>(`/admin/v1/vendors/profiles/${vendorId}`, {
      // Media URLs are short-lived signed R2 links, so this deliberately does
      // not sit in the data cache — a cached page would hand out dead images.
      cache: "no-store",
    })
  } catch (err) {
    if (err instanceof ApiCallError && err.status === 404) notFound()
    throw err
  }

  return (
    <div className="page-content animate-slide-up">
      <div>
        <BackButton href="/vendors/profiles">Back to Profiles</BackButton>
        <h1 className="mt-3 font-display text-2xl font-semibold tracking-tight text-foreground">
          {profile.displayName}
        </h1>
        <p className="text-sm text-muted-foreground">
          This is what customers see. Judge it as they would, then approve it or send it back with what to
          change.
        </p>
      </div>

      {/* Evidence left, decision right — the two are never a scroll apart. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-start">
        <VendorProfilePreview profile={profile} />
        <VendorProfileReviewPanel
          profile={profile}
          canModerate={canModerate}
          suggestedReason={buildSuggestedReason(profile)}
        />
      </div>
    </div>
  )
}
