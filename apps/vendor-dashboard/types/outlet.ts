export type OutletAdminStatus  = "ACTIVE" | "SUSPENDED" | "BANNED"
export type OutletReviewStatus = "AUTO_APPROVED" | "FLAGGED" | "MANUALLY_APPROVED" | "MANUALLY_REJECTED"

export interface OperatingHours {
  id        : string
  dayOfWeek : string
  openTime  : string
  closeTime : string
  isClosed  : boolean
  isActive  : boolean
}

export interface Outlet {
  id                    : string
  vendorId              : string
  cityId                : string
  name                  : string
  slug                  : string | null
  avatar                : string | null
  bio                   : string | null
  addressLine1          : string
  addressLine2          : string | null
  neighborhood          : string | null
  postalCode            : string | null
  latitude              : number
  longitude             : number
  deliveryRadius        : number | null
  deliveryFee           : number | null
  minimumOrder          : number | null
  phone                 : string | null
  email                 : string | null
  isMainOutlet          : boolean
  ratings               : number          // maps to Prisma Outlet.ratings (Float @default(0))
  totalReviews          : number
  adminStatus           : OutletAdminStatus
  reviewStatus          : OutletReviewStatus
  flagReasons           : string[]
  flaggedAt             : string | null
  isTemporarilyClosed   : boolean
  temporarilyClosedUntil: string | null
  vendorDisabledAt      : string | null
  createdAt             : string
  city                  : { id: string; name: string } | null
  cuisines              : { cuisine: { id: string; name: string; code: string } }[]
  operatingHours        : OperatingHours[]
  _count?               : { meals: number }
}

export interface CreateOutletPayload {
  name           : string
  addressLine1   : string
  addressLine2?  : string
  cityId         : string
  neighborhood?  : string
  postalCode?    : string
  latitude       : number
  longitude      : number
  phone?         : string
  email?         : string
  bio?           : string
  deliveryRadius?: number
  minimumOrder?  : number
  deliveryFee?   : number
}

export interface UpdateOutletPayload extends Partial<CreateOutletPayload> {}

export const DAYS_OF_WEEK = [
  "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY",
] as const
export type DayOfWeek = typeof DAYS_OF_WEEK[number]

export const DAY_LABELS: Record<DayOfWeek, string> = {
  MONDAY   : "Mon",
  TUESDAY  : "Tue",
  WEDNESDAY: "Wed",
  THURSDAY : "Thu",
  FRIDAY   : "Fri",
  SATURDAY : "Sat",
  SUNDAY   : "Sun",
}

export interface City { id: string; name: string, code: string }