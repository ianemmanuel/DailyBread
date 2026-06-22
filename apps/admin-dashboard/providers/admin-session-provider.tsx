"use client"

import { createContext, useContext } from "react"
import type { AdminSessionData, AdminPermissionKey } from "@repo/types/admin-app"


const AdminSessionContext = createContext<AdminSessionData | null>(null)

export function AdminSessionProvider({
  session,
  children,
}: {
  session : AdminSessionData
  children: React.ReactNode
}) {
  return (
    <AdminSessionContext.Provider value={session}>
      {children}
    </AdminSessionContext.Provider>
  )
}

export function useAdminSession(): AdminSessionData {
  const ctx = useContext(AdminSessionContext)
  if (!ctx) throw new Error("useAdminSession must be used within AdminSessionProvider")
  return ctx
}

/**
 * useHasPermission — for conditional UI rendering only.
 * The backend is the authoritative enforcement point.
 * A user seeing a button doesn't mean they can perform the action.
 */
export function useHasPermission(permission: AdminPermissionKey): boolean {
  const { permissions } = useAdminSession()
  return permissions.includes(permission)
}