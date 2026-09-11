"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronDown } from "lucide-react"
import { cn } from "@repo/ui/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { navSections } from "@/utils/constants/nav-items"
import { useAdminSession } from "@/providers/admin-session-provider"
import { getScopeTier } from "@/lib/auth/scope-tier"

interface SidebarNavProps {
  collapsed?: boolean
  isMobile?: boolean
}

export function SidebarNav({ collapsed = false, isMobile = false }: SidebarNavProps) {
  const pathname = usePathname()
  const session  = useAdminSession()
  const tier     = getScopeTier(session)

  const visibleSections = navSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) =>
        !(item.hideForCityTier && tier === "CITY") &&
        !(item.requiresGlobalTier && tier !== "GLOBAL") &&
        !(item.requiredPermission && !session.permissions.includes(item.requiredPermission))
      ),
    }))
    .filter((section) => section.items.length > 0)

  const [openSections, setOpenSections] = useState<Record<string, boolean>>(
    () => Object.fromEntries(navSections.map((s) => [s.title, true]))
  )

  const toggleSection = (title: string) =>
    setOpenSections((prev) => ({ ...prev, [title]: !prev[title] }))

  const isItemActive = (href: string) =>
    href === "/overview"
      ? pathname === "/overview" || pathname === "/"
      // "/vendors" is both the Vendors home link and a prefix of every
      // other vendors route — needs an exact match so "Home" doesn't
      // light up while actually viewing Applications/Accounts.
      : href === "/vendors"
        ? pathname === "/vendors"
        // "/outlets" is both the Outlets list link and a prefix of
        // "/outlets/inspections", which has its own nav entry — same pattern
        // as "/countries" below. Detail pages (/outlets/[outletId]) still
        // correctly light up the list link.
        : href === "/outlets"
          ? pathname === "/outlets" ||
            (pathname.startsWith("/outlets/") && !pathname.startsWith("/outlets/inspections"))
        // "/countries" is a prefix of "/countries/activation" and
        // "/countries/revenue", which have their own nav entries — don't
        // double-light more than one Locations item at once.
        : href === "/countries"
          ? pathname === "/countries" ||
            (pathname.startsWith("/countries/") &&
              !pathname.startsWith("/countries/activation") &&
              !pathname.startsWith("/countries/revenue"))
          // "/identity" is both the Identity & Access "Home" link and a
          // prefix of "/identity/new" and "/identity/manage" — needs an
          // exact match so Home doesn't light up while on Create/Manage.
          : href === "/identity"
            ? pathname === "/identity"
            // "/vendor-categories" is both the Vendor Categories "Home"
            // link and a prefix of "/vendor-categories/adoption" and
            // "/vendor-categories/revenue", which have their own nav
            // entries — same pattern as "/countries" above. Detail pages
            // (/vendor-categories/[slug], .../vendors) still correctly
            // light up Home, same as a country detail page does for
            // Countries' Home.
            : href === "/vendor-categories"
              ? pathname === "/vendor-categories" ||
                (pathname.startsWith("/vendor-categories/") &&
                  !pathname.startsWith("/vendor-categories/adoption") &&
                  !pathname.startsWith("/vendor-categories/revenue"))
              // "/finance" is both the Finance "Home" link and a prefix of
              // every other Finance nav entry — same pattern as above.
              : href === "/finance"
                ? pathname === "/finance" ||
                  (pathname.startsWith("/finance/") &&
                    !pathname.startsWith("/finance/vendors") &&
                    !pathname.startsWith("/finance/outlets") &&
                    !pathname.startsWith("/finance/vendor-categories") &&
                    !pathname.startsWith("/finance/needs-attention") &&
                    !pathname.startsWith("/finance/providers"))
                : pathname.startsWith(href)

  // Subtle "something in here needs your attention" nudge — never shown
  // to global admins (each of these session flags is only ever set
  // server-side for a country-scoped admin holding the relevant
  // permission, see admin.session.controller.ts). Deliberately a glow,
  // not a badge count — a "look at this" signal, not a number to chase
  // to zero. Generic by href so any nav item can carry one; a section
  // whose visible children (already permission-filtered above, so this
  // naturally only ever reflects items the viewer can actually open)
  // include a dot-carrying item aggregates it onto the section itself —
  // see sectionHasNotification below, for when Vendors (or any section)
  // is collapsed and its children aren't visible to glance at directly.
  const dotFlags: Record<string, boolean | undefined> = {
    "/vendors/compliance": session.hasOpenComplianceIssues,
    "/vendors/appeals"   : session.hasOpenAppealIssues,
    "/vendors/profiles"  : session.hasFlaggedProfiles,
  }
  const showDot = (href: string) => !!dotFlags[href]

  const isCollapsed = collapsed && !isMobile

  return (
    <nav className="flex h-full flex-col overflow-y-auto overflow-x-hidden px-3 py-4">
      <div className="flex flex-col gap-5">
        {visibleSections.map((section) => {
          const sectionOpen    = openSections[section.title] ?? true
          const sectionHasActive = section.items.some((item) => isItemActive(item.href))
          const GroupIcon      = section.items[0]?.icon
          // Only ever aggregates dots from items actually present in
          // section.items — which is already filtered to what this admin
          // has permission to see (visibleSections above) — so a section
          // never glows because of a page the viewer can't open anyway.
          const sectionHasNotification = section.items.some((item) => showDot(item.href))

          return (
            <div key={section.title}>

              {/* ── Collapsed desktop: popover per section ──── */}
              {isCollapsed ? (
                GroupIcon && (
                  <Popover>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <PopoverTrigger asChild>
                          <button
                            aria-label={`Open ${section.title}`}
                            className={cn(
                              "relative mb-1 flex w-full items-center justify-center rounded-lg py-2.5 transition-colors duration-150",
                              sectionHasActive
                                ? "bg-sidebar-active-bg text-[var(--sidebar-active-icon)]"
                                : "text-[var(--sidebar-icon)] hover:bg-sidebar-hover-bg hover:text-foreground"
                            )}
                          >
                            <GroupIcon className="h-4 w-4 shrink-0" />
                            {sectionHasNotification && (
                              <span className="absolute right-2.5 top-1.5 flex h-1.5 w-1.5" aria-label="Needs attention">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
                                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-destructive" />
                              </span>
                            )}
                          </button>
                        </PopoverTrigger>
                      </TooltipTrigger>
                      <TooltipContent side="right" sideOffset={10} className="text-xs font-medium">
                        {section.title}
                      </TooltipContent>
                    </Tooltip>

                    <PopoverContent
                      side="right"
                      sideOffset={12}
                      align="start"
                      className="w-52 border-border bg-popover p-1.5 shadow-[var(--shadow-dropdown)]"
                    >
                      <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                        {section.title}
                      </p>
                      <ul className="space-y-0.5">
                        {section.items.map((item) => {
                          const isActive = isItemActive(item.href)
                          const Icon     = item.icon
                          return (
                            <li key={item.href}>
                              <Link
                                href={item.href}
                                className={cn(
                                  "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors duration-150",
                                  isActive
                                    ? "bg-sidebar-active-bg text-[var(--sidebar-active-fg)]"
                                    : "text-popover-foreground hover:bg-accent"
                                )}
                              >
                                <Icon className={cn(
                                  "h-3.5 w-3.5 shrink-0",
                                  isActive ? "text-[var(--sidebar-active-icon)]" : "text-muted-foreground"
                                )} />
                                <span className="flex-1 truncate">{item.label}</span>
                                {showDot(item.href) && (
                                  <span className="relative flex h-2 w-2 shrink-0" aria-label="Needs attention">
                                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
                                    <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive" />
                                  </span>
                                )}
                                {item.badge && (
                                  <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-primary">
                                    {item.badge}
                                  </span>
                                )}
                              </Link>
                            </li>
                          )
                        })}
                      </ul>
                    </PopoverContent>
                  </Popover>
                )

              ) : (
                /* ── Expanded: accordion ────────────────────── */
                <>
                  <button
                    onClick={() => toggleSection(section.title)}
                    aria-expanded={sectionOpen}
                    className="mb-1.5 flex w-full items-center justify-between rounded-md px-2 py-1 transition-colors duration-150 hover:bg-sidebar-hover-bg"
                  >
                    <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      {section.title}
                      {/* Only while the section is collapsed — once it's
                          open, the item(s) carrying the dot are already
                          visible below, so this would just be redundant. */}
                      {!sectionOpen && sectionHasNotification && (
                        <span className="relative flex h-1.5 w-1.5" aria-label="Needs attention">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
                          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-destructive" />
                        </span>
                      )}
                    </span>
                    <ChevronDown
                      className={cn(
                        "h-3 w-3 text-muted-foreground transition-transform duration-200",
                        sectionOpen ? "rotate-0" : "-rotate-90"
                      )}
                    />
                  </button>

                  <div
                    className={cn(
                      "overflow-hidden transition-all duration-[250ms] ease-[cubic-bezier(0.4,0,0.2,1)]",
                      sectionOpen ? "max-h-[800px] opacity-100" : "max-h-0 opacity-0"
                    )}
                  >
                    <ul className="space-y-0.5">
                      {section.items.map((item) => {
                        const isActive = isItemActive(item.href)
                        const Icon     = item.icon
                        return (
                          <li key={item.href}>
                            <Link
                              href={item.href}
                              className={cn(
                                "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150",
                                isActive
                                  ? "bg-sidebar-active-bg text-[var(--sidebar-active-fg)]"
                                  : "text-[var(--sidebar-foreground)] hover:bg-sidebar-hover-bg hover:text-foreground"
                              )}
                            >
                              {/* Active indicator bar */}
                              {isActive && (
                                <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-primary" />
                              )}
                              <Icon
                                className={cn(
                                  "h-4 w-4 shrink-0 transition-colors duration-150",
                                  isActive
                                    ? "text-[var(--sidebar-active-icon)]"
                                    : "text-[var(--sidebar-icon)] group-hover:text-foreground"
                                )}
                              />
                              <span className="flex-1 truncate">{item.label}</span>
                              {showDot(item.href) && (
                                <span className="relative flex h-2 w-2 shrink-0" aria-label="Open compliance issues">
                                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
                                  <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive" />
                                </span>
                              )}
                              {item.badge && (
                                <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-primary">
                                  {item.badge}
                                </span>
                              )}
                            </Link>
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </nav>
  )
}