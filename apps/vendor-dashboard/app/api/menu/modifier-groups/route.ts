import { backendFetch } from "@/lib/api/server"
import { proxyBackendCall } from "@/lib/api/route-handler"

/*
 * Every option group the vendor has, each with its dish. Read only: a group is
 * written with its dish's save (PUT /api/menu/items/:itemId, `modifierGroups`),
 * so there is no create here any more.
 */
export async function GET() {
  return proxyBackendCall(() => backendFetch("/vendor/v1/menu/modifier-groups"))
}
