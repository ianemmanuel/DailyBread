"use client"

import { useTheme } from "next-themes"
import { Sun, Moon } from "lucide-react"
import { Button }   from "@repo/ui/components/button"
import { useEffect, useState } from "react"

/**
 * ThemeToggle — switches between light and dark mode.
 * Mounted only in dashboard — auth routes are always light.
 *
 * The `mounted` guard prevents hydration mismatch since
 * theme is read from localStorage on the client.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  if (!mounted) {
    return <div className="h-9 w-9" />  // placeholder to avoid layout shift
  }

  const isDark = theme === "dark"

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-9 w-9 rounded-lg text-(--muted-foreground) hover:bg-(--secondary) hover:text-(--foreground)"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? (
        <Sun  className="h-[1.1rem] w-[1.1rem] transition-transform duration-200" />
      ) : (
        <Moon className="h-[1.1rem] w-[1.1rem] transition-transform duration-200" />
      )}
    </Button>
  )
}