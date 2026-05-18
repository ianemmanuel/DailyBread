/**
 * geo-slug.util.ts
 *
 * Deterministic slug generation for geography entities.
 *
 *   Country slug  →  country ISO code, lower-cased
 *                    e.g. "KE"  → "ke"
 *                         "UAE" → "uae"
 *
 *   City slug     →  slugified city name  +  "-"  +  country code (lower)
 *                    e.g. "Nairobi",  "KE"  → "nairobi-ke"
 *                         "New York", "US"  → "new-york-us"
 *                         "São Paulo","BR"  → "sao-paulo-br"
 *
 * Rules:
 *   - Unicode letters are transliterated to ASCII (accents stripped).
 *   - Only [a-z0-9] and hyphens survive; everything else is removed.
 *   - Multiple consecutive hyphens are collapsed to one.
 *   - Leading / trailing hyphens are stripped.
 *
 * Both functions are pure — they do not touch the database.
 * Uniqueness enforcement is the DB's job (@unique constraint).
 */

/**
 * Transliterate common accented / diacritic characters to their ASCII base.
 * Covers the characters most likely to appear in country and city names.
 * Extend as needed.
 */
function transliterate(str: string): string {
  return str
    .normalize("NFD")                     // decompose accents: é → e + ́
    .replace(/[\u0300-\u036f]/g, "")      // strip combining diacritics
    // Catch any remaining non-ASCII characters we can map
    .replace(/[øØ]/g,  "o")
    .replace(/[ðÐ]/g,  "d")
    .replace(/[þÞ]/g,  "th")
    .replace(/[ßẞ]/g,  "ss")
    .replace(/[æÆ]/g,  "ae")
    .replace(/[œŒ]/g,  "oe")
    .replace(/[łŁ]/g,  "l")
    .replace(/ñ/g,     "n")
    .replace(/ç/g,     "c")
}

/**
 * Core slug normaliser: trim → lower → transliterate → strip non-alnum → collapse hyphens.
 */
function slugify(raw: string): string {
  return transliterate(raw.trim().toLowerCase())
    .replace(/[^a-z0-9]+/g, "-")   // replace any run of non-alnum with a hyphen
    .replace(/^-+|-+$/g, "")       // strip leading / trailing hyphens
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Generate a country slug from its ISO code.
 *
 * @example
 *   buildCountrySlug("KE")  → "ke"
 *   buildCountrySlug("US")  → "us"
 *   buildCountrySlug("UAE") → "uae"
 */
export function buildCountrySlug(code: string): string {
  const s = slugify(code)
  if (!s) throw new Error(`Cannot build slug from country code: "${code}"`)
  return s
}

/**
 * Generate a city slug from the city name and its country code.
 *
 * @example
 *   buildCitySlug("Nairobi",   "KE") → "nairobi-ke"
 *   buildCitySlug("New York",  "US") → "new-york-us"
 *   buildCitySlug("São Paulo", "BR") → "sao-paulo-br"
 *   buildCitySlug("Dubai",     "AE") → "dubai-ae"
 */
export function buildCitySlug(cityName: string, countryCode: string): string {
  const nameSlug = slugify(cityName)
  const codeSlug = slugify(countryCode)
  if (!nameSlug) throw new Error(`Cannot build slug from city name: "${cityName}"`)
  if (!codeSlug) throw new Error(`Cannot build slug from country code: "${countryCode}"`)
  return `${nameSlug}-${codeSlug}`
}