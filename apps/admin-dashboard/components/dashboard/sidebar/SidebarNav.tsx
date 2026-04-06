"use client"

import Link            from "next/link"
import { usePathname } from "next/navigation"
import { cn }          from "@repo/ui/lib/utils"
import { navSections } from "@/utils/constants/nav-items"

/**
 * SidebarNav — renders the nav sections and items.
 * Used by both SidebarDesktop and the mobile Sheet.
 * Client component only for usePathname (active link detection).
 */
export function SidebarNav() {
  const pathname = usePathname()

  return (
    <nav className="h-full overflow-y-auto px-3 py-4" aria-label="Main navigation">
      <div className="space-y-5">
        {navSections.map((section) => (
          <div key={section.title}>
            <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 select-none">
              {section.title}
            </p>
            <ul className="space-y-0.5" role="list">
              {section.items.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/" && pathname?.startsWith(item.href))
                const Icon = item.icon

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-150",
                        isActive
                          ? "bg-primary/10 text-primary dark:bg-primary/15"
                          : "text-muted-foreground hover:bg-secondary/70 hover:text-foreground dark:hover:bg-white/5 dark:hover:text-foreground",
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-4 w-4 shrink-0",
                          isActive ? "text-primary" : "text-muted-foreground/60",
                        )}
                        aria-hidden="true"
                      />
                      <span className="flex-1">{item.label}</span>
                      {item.badge && (
                        <span className="badge-info text-[10px] px-1.5 py-0">
                          {item.badge}
                        </span>
                      )}
                      {isActive && (
                        <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden="true" />
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