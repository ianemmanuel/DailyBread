export interface CreateOutletInput {
  name         : string
  addressLine1 : string
  addressLine2?: string
  cityId       : string
  neighborhood?: string
  postalCode?  : string
  latitude     : number
  longitude    : number
  phone?       : string
  email?       : string
  bio?         : string
  deliveryRadius? : number
  minimumOrder?   : number
  deliveryFee?    : number
}

export interface UpdateOutletInput {
  name?        : string
  addressLine1?: string
  addressLine2?: string
  neighborhood?: string
  postalCode?  : string
  phone?       : string
  email?       : string
  bio?         : string
  deliveryRadius? : number
  minimumOrder?   : number
  deliveryFee?    : number
  // Coordinates may change if vendor corrects a pin — re-runs coordinate check
  latitude?    : number
  longitude?   : number
}

export interface OperatingHoursEntry {
  dayOfWeek : "MONDAY" | "TUESDAY" | "WEDNESDAY" | "THURSDAY" | "FRIDAY" | "SATURDAY" | "SUNDAY"
  openTime  : string  // "08:00"
  closeTime : string 
  isClosed  : boolean
}

export interface AddPayoutAccountInput {
  countryPaymentMethodId: string
  accountHolderName     : string
  // Mobile money
  mobileNetwork?  : string
  mobileNumber?   : string
  // Bank
  bankName?       : string
  branchName?     : string
  bankCode?       : string
  accountNumber?  : string
  swiftCode?      : string
  iban?           : string
  routingNumber?  : string
  // Digital wallets
  paypalEmail?    : string
  stripeAccountId?: string
}

export type idParam = { id: string }
