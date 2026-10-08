import type { NextRequest } from "next/server"
import { proxyToBackend } from "@/lib/api/proxy"

/* Creating a reason goes through the ONE reason system's own endpoint
 * (settings:action_reasons:write, reach checked by the backend). */
export function POST(req: NextRequest) {
  return proxyToBackend(req, "/admin/v1/action-reasons", { label: "meal-reason-create", expire: ["meal-reasons"] })
}
