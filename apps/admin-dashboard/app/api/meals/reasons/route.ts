import type { NextRequest } from "next/server"
import { proxyToBackend } from "@/lib/api/proxy"

/** Reasons offered for one action (?action=&countryId=), plus whether "Other"
 *  and escalation are open to this admin — the server's answers. */
export function GET(req: NextRequest) {
  return proxyToBackend(req, "/admin/v1/vendors/meals/reasons", { label: "meal-reasons" })
}
