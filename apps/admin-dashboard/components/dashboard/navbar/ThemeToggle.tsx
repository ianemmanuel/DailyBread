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
          <Sun className="h-4 w-4 scale-100 rotate-0 transition-all duration-200 dark:scale-0 dark:-rotate-90" />
          <Moon className="absolute h-4 w-4 scale-0 rotate-90 transition-all duration-200 dark:scale-100 dark:rotate-0" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>


      <DropdownMenuContent
        align="end"
        sideOffset={10}
        collisionPadding={8}
        className="min-w-[148px] rounded-[var(--radius)] border border-border bg-popover p-1.5 text-popover-foreground shadow-[var(--shadow-dropdown)]"
      >
        <DropdownMenuItem
          onClick={() => setTheme("light")}
          className={[
            "flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium",
            "transition-colors duration-150",
            theme === "light"
              ? "bg-[var(--primary-subtle)] text-[var(--primary)]"
              : "text-foreground hover:bg-accent",
          ].join(" ")}
        >
          <Sun className="h-3.5 w-3.5 shrink-0" />
          Light
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => setTheme("dark")}
          className={[
            "flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium",
            "transition-colors duration-150",
            theme === "dark"
              ? "bg-[var(--primary-subtle)] text-[var(--primary)]"
              : "text-foreground hover:bg-accent",
          ].join(" ")}
        >
          <Moon className="h-3.5 w-3.5 shrink-0" />
          Dark
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => setTheme("system")}
          className={[
            "flex cursor-pointer items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium",
            "transition-colors duration-150",
            theme === "system"
              ? "bg-[var(--primary-subtle)] text-[var(--primary)]"
              : "text-foreground hover:bg-accent",
          ].join(" ")}
        >
          <Monitor className="h-3.5 w-3.5 shrink-0" />
          System
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}