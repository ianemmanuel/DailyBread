import "server-only"
import { backendFetch, BackendApiError } from "@/lib/api/server"
import type { VendorMenu, VendorMenuDetail } from "@/lib/queries/menus"

/*
 * Server-side menu reads for the pages. Uncached (backendFetch's no-store
 * default): a vendor editing a menu reads it straight back, and the list is
 * small. The backend scopes every read to the caller's own outlets.
 */
export async function getMenus(): Promise<VendorMenu[]> {
  return backendFetch<VendorMenu[]>("/vendor/v1/menu/menus")
}

/** One menu, or null when it does not exist or is not this vendor's. */
export async function getMenu(menuId: string): Promise<VendorMenuDetail | null> {
  try {
    return await backendFetch<VendorMenuDetail>(`/vendor/v1/menu/menus/${encodeURIComponent(menuId)}`)
  } catch (err) {
    if (err instanceof BackendApiError && err.status === 404) return null
    throw err
  }
}
