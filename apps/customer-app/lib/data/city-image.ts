/*
 * A city's photograph — for the "Continue to <city>" card and, later, any
 * other place a city is shown as a picture.
 *
 * PLACEHOLDER. Every city gets the same twilight Nairobi skyline (Pexels
 * 29069329, downloaded and looked at before use — landscape, dark sky on the
 * left where copy sits). When cities carry their own imagery the backend will
 * return it the way cuisines do — a WebP derivative in the public bucket,
 * `publicUrl(imageKey)` — and this function becomes a read of that field.
 * Nothing that renders a city image needs to change.
 *
 * `isPlaceholder` lets a caller avoid claiming the picture shows the city it
 * is labelled with: the alt text stays empty while it is generic.
 */

export interface CityImage {
  url          : string
  alt          : string
  isPlaceholder: boolean
}

const PLACEHOLDER_ID = 29069329

export function cityImage(_citySlug: string): CityImage {
  return {
    url          : `https://images.pexels.com/photos/${PLACEHOLDER_ID}/pexels-photo-${PLACEHOLDER_ID}.jpeg?auto=compress&cs=tinysrgb&w=1600`,
    alt          : "",
    isPlaceholder: true,
  }
}
