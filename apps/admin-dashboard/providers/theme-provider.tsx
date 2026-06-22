"use client"

import { ThemeProvider as NextThemesProvider } from "next-themes"

/**
 * Uses "class" strategy so `.dark` is applied to <html>, which is what
 * tokens.css and globals.css target.
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