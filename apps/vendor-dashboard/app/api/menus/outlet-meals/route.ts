import { NextRequest } from "next/server"
import { backendFetch } from "@/lib/api/server"
import { proxyBackendCall } from "@/lib/api/route-handler"

/** The meals at one of the caller's outlets — what a menu there may list. */
export async function GET(req: NextRequest) {
  const qs = req.nextUrl.searchParams.toString()
  return proxyBackendCall(() => backendFetch(`/vendor/v1/menu/menus/outlet-meals${qs ? `?${qs}` : ""}`))
}
