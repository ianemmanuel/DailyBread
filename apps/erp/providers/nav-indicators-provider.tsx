"use client"

import { createContext, useContext } from "react"

/** Counts the server rendered for the sidebar. Refreshed with the layout (router.refresh()), never polled. */
export interface NavIndicators {
  /** Pending permission setups that need this viewer's attention; null when unknown. */
  pendingPermissionSetups: number | null
}

const NavIndicatorsContext = createContext<NavIndicators>({ pendingPermissionSetups: null })

export function NavIndicatorsProvider({ value, children }: { value: NavIndicators; children: React.ReactNode }) {
  return <NavIndicatorsContext.Provider value={value}>{children}</NavIndicatorsContext.Provider>
}

export function useNavIndicators(): NavIndicators {
  return useContext(NavIndicatorsContext)
}
