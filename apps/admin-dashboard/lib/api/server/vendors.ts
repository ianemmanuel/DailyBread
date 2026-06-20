import { LatestVendorApplication, VendorMetrics } from "@/types/vendor.types"

export async function fetchLatestVendorApplications(
  token: string,
  countrySlug: string,
): Promise<LatestVendorApplication[]> {
  try {
    const res = await fetch(
      `${process.env.BACKEND_API_URL}/admin/v1/vendors/applications?status=APPROVED&countrySlug=${countrySlug}&page=1&pageSize=5`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        next: { revalidate: 60 },
      },
    )

    if (!res.ok) return []

    const { data } = await res.json()

    return data.applications ?? []
  } catch {
    return []
  }
}


export async function fetchCountryVendorMetrics(
  token: string,
  countrySlug: string,
): Promise<VendorMetrics | null> {
  try {
    const res = await fetch(
      `${process.env.BACKEND_API_URL}/admin/v1/platform/countries/${countrySlug}/vendors`,
      {
        headers: { Authorization: `Bearer ${token}`},
        next: { revalidate: 60},
      },
    )

    if (!res.ok) return null

    const json = await res.json()

    const snapshot = json.data

    return {
      totalVendors:
        snapshot.accounts.active +
        snapshot.accounts.suspended +
        snapshot.accounts.banned,

      activeVendors:
        snapshot.accounts.active,

      suspendedVendors:
        snapshot.accounts.suspended,

      bannedVendors:
        snapshot.accounts.banned,

      draftApplications:
        snapshot.applications.draft,

      submittedApplications:
        snapshot.applications.submitted,

      underReviewApplications:
        snapshot.applications.underReview,

      approvedApplications:
        snapshot.applications.approved,

      rejectedApplications:
        snapshot.applications.rejected,

      vendorsByType:
        snapshot.vendorTypes.map(
          (v: {
            name: string
            count: number
          }) => ({
            type: v.name,
            count: v.count,
          }),
        ),
    }
  } catch {
    return null
  }
}