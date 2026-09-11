import { backendFetch } from "@/lib/api/server"
import { proxyBackendCall } from "@/lib/api/route-handler"

//* GET /api/menu/context — currency, outlets, sections and the tag options the
//* meal form renders from. One read so the form never assembles itself from
//* four round trips.
export async function GET() {
  return proxyBackendCall(() => backendFetch("/vendor/v1/menu/context"))
}
