"use client"

import { ThemeProvider as NextThemesProvider } from "next-themes"

/**
 * ThemeProvider
 *
 * Wraps the (dashboard) layout only — auth routes use light theme always.
 * Uses "class" strategy so `.dark` is applied to <html>, which is what
 * tokens.css and globals.css target.
 *
 * defaultTheme: "light" — new users see light mode until they toggle.
 * storageKey: "admin-theme" — separate from vendor dashboard preference.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      storageKey="admin-theme"
      disableTransitionOnChange={false}
    >
      {children}
    </NextThemesProvider>
  )
}