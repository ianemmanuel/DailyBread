import { NextRequest } from "next/server"
import { backendFetch } from "@/lib/api/server"
import { proxyBackendCall } from "@/lib/api/route-handler"

/** One option group. Read only — groups are saved with their dish. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params
  return proxyBackendCall(() => backendFetch(`/vendor/v1/menu/modifier-groups/${groupId}`))
}
