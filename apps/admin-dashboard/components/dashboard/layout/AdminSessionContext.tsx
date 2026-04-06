"use client"

import { createContext, useContext } from "react"
import type { AdminSessionData }     from "@repo/types/admin-app"

// ─── Context ──────────────────────────────────────────────────────────────────

const AdminSessionContext = createContext<AdminSessionData | null>(null)

// ─── Provider ─────────────────────────────────────────────────────────────────

/**
 * AdminSessionProvider
 *
 * Wraps the dashboard layout. Receives session data fetched server-side
 * (zero client round-trip) and makes it available to all client components
 * via useAdminSession().
 *
 * Data: id, email, fullName, role, permissions, scope.
 * This never changes mid-session — users must re-authenticate to get new data.
 * Re-validated on every hard navigation by the server layout.
 */
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

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAdminSession(): AdminSessionData {
  const ctx = useContext(AdminSessionContext)
  if (!ctx) {
    throw new Error("useAdminSession must be used within AdminSessionProvider")
  }
  return ctx
}

// ─── Permission helper ────────────────────────────────────────────────────────

/**
 * useHasPermission(key)
 * Returns true if the current admin holds the given permission.
 * Used to conditionally render UI elements.
 * The backend remains the authoritative enforcement point.
 */
export function useHasPermission(permission: string): boolean {
  const { permissions } = useAdminSession()
  return permissions.includes(permission as any)
}