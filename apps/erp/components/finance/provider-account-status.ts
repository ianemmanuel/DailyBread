/*
 * One vocabulary for a CountryProviderAccount's lifecycle, used everywhere
 * it's shown. The Prisma enum values stay (DRAFT / ACTIVE / SUSPENDED /
 * DISABLED); these are the words the admin actually sees.
 *
 *   DRAFT     → "Draft"     — being set up, not usable
 *   ACTIVE    → "Enabled"   — live
 *   SUSPENDED → "Disabled"  — temporarily off, reversible (Enable)
 *   DISABLED  → "Archived"  — decommissioned, reversible to Draft (Restore)
 */
export const PROVIDER_ACCOUNT_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  ACTIVE: "Enabled",
  SUSPENDED: "Disabled",
  DISABLED: "Archived",
}

export const PROVIDER_ACCOUNT_STATUS_BADGE: Record<string, string> = {
  DRAFT: "badge-neutral",
  ACTIVE: "badge-success",
  SUSPENDED: "badge-warning",
  DISABLED: "badge-neutral",
}

export function providerAccountStatusLabel(status: string): string {
  return PROVIDER_ACCOUNT_STATUS_LABEL[status] ?? status
}
