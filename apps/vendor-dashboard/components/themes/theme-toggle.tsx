"use client"

import { Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"
import { Button } from "@repo/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu"

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-label="Toggle theme"
        >
          <Sun className="h-4.5 w-4.5 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
          <Moon className="absolute h-4.5 w-4.5 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-44 rounded-2xl p-2 shadow-xl !bg-card border border-border/60"
      >
        {(
          [
            { value: 'light', label: 'Light',  Icon: Sun  },
            { value: 'dark',  label: 'Dark',   Icon: Moon },
            { value: 'system',label: 'System', Icon: null },
          ] as const
        ).map(({ value, label, Icon }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => setTheme(value)}
            className={`
              flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm cursor-pointer
              transition-colors
              ${theme === value
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-muted-foreground hover:bg-secondary hover:text-foreground font-normal'
              }
            `}
          >
            {Icon
              ? <Icon className="h-4 w-4 shrink-0" />
              : <span className="h-4 w-4 shrink-0 flex items-center justify-center">
                  <span className="h-3 w-3 rounded-full border-2 border-current" />
                </span>
            }
            {label}
            {theme === value && (
              <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}