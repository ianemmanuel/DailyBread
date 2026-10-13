"use client"

import Link from "next/link"
import { PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { SidebarNav } from "./SidebarNav"
import { useSidebar } from "@/hooks/use-sidebar"
import { useAdminSession } from "@/providers/admin-session-provider"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

export function SidebarDesktop() {
  const { collapsed, toggle } = useSidebar()
  const session = useAdminSession()

  const first       = session.firstName?.trim() ?? ""
  const last        = session.lastName?.trim()  ?? ""
  const initials    = ((first[0] ?? "") + (last[0] ?? "") || first[0] || "?").toUpperCase()
  const displayName = [session.firstName, session.lastName].filter(Boolean).join(" ")

  return (
    <aside
      data-collapsed={collapsed}
      style={{ width: collapsed ? "72px" : "240px" }}
      className={[
        "fixed left-0 top-0 z-40 hidden h-screen flex-col lg:flex",
        "overflow-hidden will-change-[width]",
        "border-r border-sidebar-border bg-sidebar",
        "transition-[width] duration-[380ms] ease-[cubic-bezier(0.4,0,0.2,1)]",
      ].join(" ")}
    >
      {/* ── Header ──────────────────────────────────────────── */}
      <div
        className={[
          "flex h-16 shrink-0 items-center justify-between overflow-hidden border-b border-sidebar-border",
          "transition-[padding] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
          collapsed ? "px-0" : "pl-4 pr-3",
        ].join(" ")}
      >
        {/* Logo */}
        <Link
          href="/overview"
          className={[
            "flex shrink-0 items-center gap-2.5 overflow-hidden",
            collapsed ? "w-full justify-center" : "",
          ].join(" ")}
        >
          {/* Icon mark */}
          <div
            className={[
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary",
              "transition-transform duration-300",
              collapsed ? "translate-x-1" : "translate-x-0",
            ].join(" ")}
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path
                d="M10 2C6.5 2 4 5 4 8c0 2 1 3.5 2 4.5V15h8v-2.5C15 11.5 16 10 16 8c0-3-2.5-6-6-6z"
                fill="white" fillOpacity="0.95"
              />
              <path
                d="M7 15h6v1.5a1 1 0 01-1 1H8a1 1 0 01-1-1V15z"
                fill="white" fillOpacity="0.7"
              />
            </svg>
          </div>

          {/* Wordmark */}
          <span
            className={[
              "overflow-hidden whitespace-nowrap font-display text-[15px] font-semibold tracking-tight text-foreground",
              "transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
              collapsed ? "w-0 opacity-0" : "w-auto opacity-100",
            ].join(" ")}
          >
            Daily<span className="text-primary">Bread</span>
          </span>
        </Link>

        {/* Collapse button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          aria-label="Collapse sidebar"
          className={[
            "h-7 w-7 shrink-0 text-muted-foreground transition-all duration-200 hover:bg-sidebar-hover-bg hover:text-foreground",
            collapsed ? "pointer-events-none opacity-0" : "opacity-100",
          ].join(" ")}
        >
          <PanelLeftClose size={16} />
        </Button>
      </div>

      {/* ── Nav ─────────────────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <SidebarNav collapsed={collapsed} />
      </div>

      {/* ── Footer ──────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-sidebar-border">

        {/* Collapsed state: expand + avatar */}
        <div
          className={[
            "flex flex-col items-center gap-2 py-3",
            "transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
            collapsed ? "opacity-100" : "pointer-events-none h-0 overflow-hidden py-0 opacity-0",
          ].join(" ")}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggle}
                aria-label="Expand sidebar"
                className="h-9 w-9 text-muted-foreground hover:bg-sidebar-hover-bg hover:text-foreground"
              >
                <PanelLeftOpen size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              <span className="text-xs font-medium">Expand sidebar</span>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex h-8 w-8 cursor-default items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                {initials}
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              <div className="flex flex-col gap-0.5">
                <p className="text-xs font-semibold">{displayName}</p>
                <p className="text-[11px] text-muted-foreground">
                  {session.role?.displayName ?? "Admin"}
                </p>
              </div>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Expanded state: user card */}
        <div
          className={[
            "overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
            collapsed ? "max-h-0 opacity-0 pointer-events-none" : "max-h-24 opacity-100",
          ].join(" ")}
        >
          <div className="p-3">
            <div className="flex items-center gap-3 rounded-lg bg-sidebar-hover-bg px-3 py-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold leading-tight text-foreground">
                  {displayName || "—"}
                </p>
                <p className="truncate text-xs leading-tight text-muted-foreground">
                  {session.role?.displayName ?? "Admin"}
                </p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </aside>
  )
}