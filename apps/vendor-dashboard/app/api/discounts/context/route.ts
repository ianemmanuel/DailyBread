import { backendFetch } from "@/lib/api/server"
import { proxyBackendCall } from "@/lib/api/route-handler"

/** Outlets, dishes, currency, and the numbers behind "what you keep". */
export async function GET() {
  return proxyBackendCall(() => backendFetch("/vendor/v1/discounts/context"))
}
