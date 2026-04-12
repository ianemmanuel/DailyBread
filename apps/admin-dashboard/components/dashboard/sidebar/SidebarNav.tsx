"use client"

import Link            from "next/link"
import { usePathname } from "next/navigation"
import { cn }          from "@repo/ui/lib/utils"
import { navSections } from "@/utils/constants/nav-items"

/**
 * SidebarNav — renders all nav sections and items.
 * Used by both SidebarDesktop and MobileSidebar Sheet — zero duplication.
 *
 * Active detection: exact match OR starts-with for nested routes
 * (e.g. /identity/new and /identity/abc are both "active" under /identity).
 *
 * Dark theme: uses CSS variables from globals.css so light/dark works
 * automatically across ALL dashboard pages without any extra class toggling.
 */
export function SidebarNav() {
  const pathname = usePathname()

  return (
    <nav className="h-full overflow-y-auto px-3 py-4" aria-label="Main navigation">
      <div className="space-y-5">
        {navSections.map((section) => (
          <div key={section.title}>
            <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-widest select-none text-(--muted-foreground) opacity-50">
              {section.title}
            </p>
            <ul className="space-y-0.5" role="list">
              {section.items.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/" && pathname?.startsWith(item.href + "/")) ||
                  (item.href !== "/" && pathname === item.href)

                const Icon = item.icon

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        // Base — uses CSS vars so light AND dark both work
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150",
                        isActive
                          ? // Active: terracotta bg tint + primary text
                            "bg-primary/10 text-primary dark:bg-primary/15 dark:text-primary"
                          : // Inactive: muted foreground, hover lifts slightly
                            "text-(--sidebar-foreground) opacity-70 hover:opacity-100 hover:bg-(--sidebar-accent) hover:text-(--sidebar-foreground)",
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-4 w-4 shrink-0",
                          isActive ? "text-primary" : "opacity-60",
                        )}
                        aria-hidden="true"
                      />
                      <span className="flex-1 truncate">{item.label}</span>
                      {item.badge && (
                        <span className="badge-info text-[10px] px-1.5 py-0">
                          {item.badge}
                        </span>
                      )}
                      {isActive && (
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                          aria-hidden="true"
                        />
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  )
}