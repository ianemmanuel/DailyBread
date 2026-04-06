"use client"

import { useTheme }  from "next-themes"
import { Sun, Moon } from "lucide-react"
import { Button }    from "@repo/ui/components/button"

/**
 * ThemeToggle — switches between light and dark mode.
 * Uses next-themes. The .dark class on <html> triggers globals.css dark block.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-9 w-9 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground dark:hover:bg-white/5"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      <Sun  className="h-4.5 w-4.5 scale-100 transition-transform dark:scale-0" />
      <Moon className="absolute h-4.5 w-4.5 scale-0 transition-transform dark:scale-100" />
    </Button>
  )
}