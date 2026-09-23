import { NextResponse } from "next/server"

import { envelopeError, envelopeReject } from "@/lib/api/proxy"
import { getCityDetail } from "@/lib/data/cities"

/*
 * GET /api/cities/:citySlug — one city and the areas we operate in.
 *
 * For the location picker, which asks for this only after the backend has
 * said it cannot reach a visitor. Answering "we are not at your address" is
 * not much use on its own; answering it with the places we DO cover in that
 * city is.
 *
 * Shares `getCityDetail` with the city page, so both read one cache entry and
 * one definition of what counts as an area. Written out rather than wrapped in
 * `proxyBackendCall` because the three outcomes are genuinely different and
 * must not collapse into one: a city we do not serve is a 404, an unreachable
 * backend is a 5xx, and only a real city is a 200 (recurring bug class #4).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ citySlug: string }> },
) {
  const { citySlug } = await params

  try {
    const detail = await getCityDetail(citySlug)
    if (!detail) {
      return envelopeReject(404, "CITY_NOT_FOUND", "We do not have a page for that city.")
    }
    return NextResponse.json({ status: "success", data: detail })
  } catch (err) {
    return envelopeError(err)
  }
}
