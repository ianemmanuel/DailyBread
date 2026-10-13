/** Derives 1-2 letter initials for an avatar circle from a display name. */
export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || parts[0]!.slice(0, 2).toUpperCase()
}
