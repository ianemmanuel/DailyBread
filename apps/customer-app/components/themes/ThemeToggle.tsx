"use client"

import { Check, Monitor, Moon, Sun } from "lucide-react"
import { useTheme } from "./theme-provider"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const

/*
 * Light / Dark / System, rather than a two-way switch. "System" has to stay a
 * distinct choice: it is the default, and collapsing it into a toggle means a
 * visitor whose OS flips at sunset can never get back to following it.
 *
 * `theme` is the stored preference ("system" included) and `resolvedTheme` is
 * what is actually painted. The checkmark reads `theme`, so it marks what was
 * chosen; the trigger icon reads `resolvedTheme`, so it shows what is on
 * screen. Using one for both is what makes a toggle show a sun while the page
 * is dark.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme, resolvedTheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          /* `relative` is load-bearing. The two icons are stacked with one
             absolutely positioned, and a shadcn Button is only `inline-flex`.
             Without a positioned ancestor here the moon resolves against the
             sticky <header> instead and lands in the corner of the bar. */
          className={`relative ${className ?? ""}`}
          aria-label="Change theme"
        >
          {/* Both icons are always rendered and cross-faded by the `dark:`
              variant, so the swap needs no JS and cannot flash the wrong icon
              before the theme provider hydrates. */}
          <Sun className="size-[1.15rem] scale-100 rotate-0 transition-transform duration-300 dark:scale-0 dark:-rotate-90" />
          <Moon className="absolute size-[1.15rem] scale-0 rotate-90 transition-transform duration-300 dark:scale-100 dark:rotate-0" />
          <span className="sr-only">
            Theme: {resolvedTheme === "dark" ? "dark" : "light"}
          </span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-40">
        {OPTIONS.map(({ value, label, icon: Icon }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => setTheme(value)}
            className="cursor-pointer gap-2"
          >
            <Icon className="size-4 text-muted-foreground" />
            <span className="flex-1">{label}</span>
            {theme === value && <Check className="size-4 text-primary-text" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
