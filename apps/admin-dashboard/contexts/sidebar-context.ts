import { createContext } from "react"

export type SidebarContextType = {
  collapsed: boolean
  toggle: () => void
  setCollapsed: (v: boolean) => void
}

export const SidebarContext = createContext<SidebarContextType | null>(null)