import "server-only"
import { backendFetch, BackendApiError } from "@/lib/api/server"
import type { MenuContext, MenuItem, MenuItemListResult } from "@/lib/queries/menu"

/*
 * Server-side menu data access — the ONE place vendor menu endpoints are
 * called from a server component, mirroring lib/vendor/outlets.ts.
 *
 * Safe on per-vendor data for the same verified reason as outlets: Next hashes
 * the fetch headers into the Data Cache key, so one vendor's bearer token can
 * never read another's cached response.
 */

export const MENU_TAG = "vendor-menu"
export const menuItemTag = (id: string) => `vendor-menu-item-${id}`

const LIST_REVALIDATE = 60

export interface MenuListParams {
  search?   : string
  sectionId?: string
  page?     : number
  pageSize? : number
}

export async function getMenuItems(params: MenuListParams = {}): Promise<MenuItemListResult> {
  const qs = new URLSearchParams()
  if (params.search)    qs.set("search", params.search)
  if (params.sectionId) qs.set("sectionId", params.sectionId)
  qs.set("page", String(params.page ?? 1))
  qs.set("pageSize", String(params.pageSize ?? 12))

  return backendFetch<MenuItemListResult>(`/vendor/v1/menu/items?${qs}`, {
    // Image URLs in the response are short-lived signed R2 links, so this is
    // deliberately short: a longer TTL would serve dead images.
    revalidate: LIST_REVALIDATE,
    tags      : [MENU_TAG],
  })
}

export async function getMenuContext(): Promise<MenuContext> {
  return backendFetch<MenuContext>("/vendor/v1/menu/context", {
    revalidate: LIST_REVALIDATE,
    tags      : [MENU_TAG],
  })
}

/** One dish, or null when it doesn't exist / isn't this vendor's. */
export async function getMenuItem(itemId: string): Promise<MenuItem | null> {
  try {
    return await backendFetch<MenuItem>(`/vendor/v1/menu/items/${itemId}`, {
      revalidate: LIST_REVALIDATE,
      tags      : [MENU_TAG, menuItemTag(itemId)],
    })
  } catch (err) {
    if (err instanceof BackendApiError && err.status === 404) return null
    throw err
  }
}
