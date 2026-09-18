import type { CustomerCurrency } from "@repo/types/customer-app"

/*
 * Shared helpers for the landing page's STATIC placeholder content. Delete this
 * file once every section loads real data from the backend.
 *
 * Every Pexels id used on the landing page was downloaded and looked at before
 * it was added. Don't add one unseen.
 */

/** A Pexels photo cropped to an exact size. Omit `height` to keep the photo's
 *  own proportions. */
export function pexels(id: number, width: number, height?: number): string {
  const size = height ? `&w=${width}&h=${height}&fit=crop` : `&w=${width}`
  return `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb${size}`
}

/** Prices are integer minor units, like the backend sends them. Kenya shillings
 *  because the dev data is in Nairobi. */
export const PLACEHOLDER_CURRENCY: CustomerCurrency = {
  code: "KES",
  symbol: "KSh",
  minorUnitDigits: 2,
}
