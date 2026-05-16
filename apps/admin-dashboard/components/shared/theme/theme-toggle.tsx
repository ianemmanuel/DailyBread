"use client"

import { Moon, Sun, Monitor } from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@repo/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu"

export function ThemeToggle() {
  const { setTheme, theme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 rounded-lg"
          aria-label="Toggle theme"
        >
          {/* Sun — visible in light mode */}
          <Sun
            className="h-4 w-4 scale-100 rotate-0 transition-all duration-200 dark:scale-0 dark:-rotate-90"
          />
          {/* Moon — visible in dark mode */}
          <Moon
            className="absolute h-4 w-4 scale-0 rotate-90 transition-all duration-200 dark:scale-100 dark:rotate-0"
          />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={6}
        /**
         * Explicit solid background so the dropdown is never transparent.
         * We use CSS variables from the token system so it adapts to both
         * light and dark automatically.
         *
         * The shadow uses --shadow-dropdown from tokens.css which is already
         * heavier in dark mode (--shadow-dark-dropdown).
         */
        style={{
          backgroundColor: "var(--popover)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-dropdown)",
          borderRadius: "var(--radius)",
          minWidth: "140px",
          padding: "4px",
        }}
      >
        <DropdownMenuItem
          onClick={() => setTheme("light")}
          className="flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-sm"
          style={{
            color: theme === "light" ? "var(--primary)" : "var(--foreground)",
            backgroundColor: theme === "light" ? "var(--primary-subtle)" : "transparent",
            fontWeight: theme === "light" ? 500 : 400,
          }}
        >
          <Sun className="h-3.5 w-3.5 shrink-0" />
          Light
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => setTheme("dark")}
          className="flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-sm"
          style={{
            color: theme === "dark" ? "var(--primary)" : "var(--foreground)",
            backgroundColor: theme === "dark" ? "var(--primary-subtle)" : "transparent",
            fontWeight: theme === "dark" ? 500 : 400,
          }}
        >
          <Moon className="h-3.5 w-3.5 shrink-0" />
          Dark
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => setTheme("system")}
          className="flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-sm"
          style={{
            color: theme === "system" ? "var(--primary)" : "var(--foreground)",
            backgroundColor: theme === "system" ? "var(--primary-subtle)" : "transparent",
            fontWeight: theme === "system" ? 500 : 400,
          }}
        >
          <Monitor className="h-3.5 w-3.5 shrink-0" />
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}