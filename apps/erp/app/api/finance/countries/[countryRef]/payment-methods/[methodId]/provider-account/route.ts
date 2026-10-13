import { auth } from "@clerk/nextjs/server"
import { revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

const BACKEND = process.env.BACKEND_API_URL

type P = { params: Promise<{ countryRef: string; methodId: string }> }

// Wire (or unwire, with countryProviderAccountId: null) a CountryPaymentMethod
// to a CountryProviderAccount. Phase 1C.
export async function PATCH(req: NextRequest, { params }: P) {
  const { countryRef, methodId } = await params
  try {
    const { getToken } = await auth()
    const token = await getToken()
    if (!token) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

    const body = await req.text()
    const res = await fetch(
      `${BACKEND}/admin/v1/finance/countries/${countryRef}/payment-methods/${methodId}/provider-account`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body,
      },
    )
    const data = await res.json()
    if (res.ok) {
      revalidateTag(`finance-country-config-${countryRef}`, {})
      revalidateTag("finance-country-config", {})
      // The Payment Methods page shows "Runs on <provider>" per method — it
      // reads the same wiring, so refresh it too.
      revalidateTag("payment-methods", {})
      revalidateTag(`country-${countryRef}`, {})
      revalidateTag("countries", {})
    }
    return NextResponse.json(data, { status: res.status })
  } catch (err) {
    console.error("[finance-payment-method-provider]", err)
    return NextResponse.json({ message: "Internal error" }, { status: 500 })
  }
}
