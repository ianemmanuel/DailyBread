import type { MealReasonAction } from "@repo/types/enums"

/* Meals operations: overview, escalations and the reason library — all as the
 * backend returns them; nothing is re-derived in the ERP. */

export interface MealEscalationRow {
  id             : string
  status         : "PENDING" | "RESOLVED"
  note           : string
  requestedAction: MealReasonAction | null
  resolutionNote : string | null
  createdAt      : string
  resolvedAt     : string | null
  mealId         : string
  menuItemId     : string
  dishName       : string
  outletId       : string
  outletName     : string
  createdBy      : { id: string; firstName: string; lastName: string }
  assignedTo     : { id: string; firstName: string; lastName: string }
  resolvedBy     : { id: string; firstName: string; lastName: string } | null
  /** Server-computed: may this admin resolve it? */
  canResolve     : boolean
}

export interface MealsOverview {
  listings      : { current: number; unavailable: number; hidden: number; suspended: number }
  dishes        : { flagged: number; rejected: number; suspended: number; banned: number }
  escalations   : { pending: number; latest: MealEscalationRow[] }
  canActDishWide: boolean
}

export interface MealReasonLibraryRow {
  id           : string
  /** SYSTEM identifier — generated from the first name, never edited. */
  code         : string
  label        : string
  vendorMessage: string | null
  isActive     : boolean
  /** Only the meal actions this reason justifies. */
  appliesTo    : MealReasonAction[]
  /** Non-meal actions the same reason also serves (kept on save). */
  otherUses    : string[]
  countryId    : string | null
  countryName  : string | null
  /** A country version: the platform reason it replaces in its country. */
  replacesPlatformId: string | null
  /** A platform reason: the countries that replaced it with their own version. */
  countryVersions   : { id: string; countryName: string }[]
  canManage           : boolean
  canAddCountryVersion: boolean
}

export interface MealReasonLibrary {
  reasons         : MealReasonLibraryRow[]
  total           : number
  page            : number
  pageSize        : number
  totalPages      : number
  canCreateGlobal : boolean
  /** Set for a COUNTRY admin who may add their own country's reasons and
   *  country versions of platform reasons. */
  canCreateCountry: { id: string; name: string } | null
}

export interface MealReasonDetail extends MealReasonLibraryRow {
  createdAt: string
  /** For a country version: the platform reason it replaces. */
  platform : { id: string; label: string; vendorMessage: string | null } | null
  canCreateCountry: { id: string; name: string } | null
}
