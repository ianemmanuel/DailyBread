"use client"

import { createContext, useContext } from "react"

/*
 * Carries what the client sidebar needs from the server-resolved session
 * ((dashboard)/layout.tsx, one getVendorSession per request): the
 * selling-ready flag (from the authoritative getVendorGoLiveStatus) and who
 * is signed in. No nav component fetches the session itself.
 */
export interface VendorIdentity {
  businessName: string | null
  email       : string | null
}

const VendorNavContext = createContext<{ sellingReady: boolean; identity: VendorIdentity }>({
  sellingReady: false,
  identity    : { businessName: null, email: null },
})

export function VendorNavProvider({
  sellingReady,
  identity,
  children,
}: {
  sellingReady: boolean
  identity    : VendorIdentity
  children    : React.ReactNode
}) {
  return <VendorNavContext.Provider value={{ sellingReady, identity }}>{children}</VendorNavContext.Provider>
}

export function useVendorNav() {
  return useContext(VendorNavContext)
}
