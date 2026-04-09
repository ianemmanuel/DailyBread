"use client"

import { createContext, useContext }        from "react"
import type { AdminSessionData }            from "@repo/types/admin-app"
import type { AdminPermissionKey }          from "@repo/types/admin-app"

// ─── Context ──────────────────────────────────────────────────────────────────
//
//* Why context at all in Next.js 16?
//
// Server components receive session as props — that covers the layout,
// Sidebar, Navbar, and all page-level server components.
//
// Context is needed ONLY for client components that are too deeply nested
// to receive props through the server→client boundary:
//   - AdminProfileButton (needs role + scope for the pill display)
//   - ThemeToggle (no session needed, but keeps the pattern consistent)
//   - Future: permission-gated UI buttons deep in page content
//
// The context is populated ONCE from the server-fetched session.
// No client-side fetching. No useEffect. No loading state.

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

// ─── Hooks ────────────────────────────────────────────────────────────────────

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