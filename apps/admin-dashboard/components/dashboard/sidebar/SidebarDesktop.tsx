"use client"

import Link from "next/link"
import { PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { SidebarNav } from "./SidebarNav"
import { useSidebar } from "@/hooks/use-sidebar"
import type { AdminSessionData } from "@repo/types/admin-app"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/ui/components/tooltip"

interface Props {
  session: AdminSessionData
}

export function SidebarDesktop({ session }: Props) {
  const { collapsed, toggle } = useSidebar()

  const first = session.firstName?.trim() ?? ""
  const last  = session.lastName?.trim()  ?? ""
  const initials = (
    (first[0] ?? "") + (last[0] ?? "") || first[0] || "?"
  ).toUpperCase()

  const displayName = [session.firstName, session.lastName]
    .filter(Boolean)
    .join(" ")

  return (
    <aside
      data-collapsed={collapsed}
      className={[
        // Position & visibility
        "fixed left-0 top-0 z-40 hidden h-screen flex-col lg:flex",
        // Width transition — identical curve/duration to the content column
        // so sidebar and page move as one coherent unit.
        "will-change-[width]",
        // Clip content that overflows during collapse (prevents momentary
        // horizontal scrollbar on the sidebar itself)
        "overflow-hidden",
      ].join(" ")}
      style={{
        width: collapsed ? "72px" : "240px",
        backgroundColor: "var(--sidebar)",
        borderRight: "1px solid var(--sidebar-border)",
        transition: "width 380ms cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      {/* ── Header: logo + collapse toggle ─────────────────── */}
      <div
        className="flex h-16 shrink-0 items-center justify-between overflow-hidden"
        style={{
          borderBottom: "1px solid var(--sidebar-border)",
          padding: collapsed ? "0" : "0 12px 0 16px",
          transition: "padding 300ms cubic-bezier(0.16,1,0.3,1)",
        }}
      >
        {/* Logo mark + wordmark */}
        <Link
          href="/overview"
          className="flex shrink-0 items-center gap-2.5 overflow-hidden"
          style={collapsed ? { justifyContent: "center", width: "100%" } : {}}
        >
          {/* Icon mark — always visible */}
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-transform duration-300"
            style={{
              backgroundColor: "var(--primary)",
              // When collapsed, center the icon in the 72px rail
              transform: collapsed ? "translateX(4px)" : "translateX(0)",
            }}
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

          {/* Wordmark — width → 0 + opacity → 0 on collapse */}
          <span
            className={[
              "overflow-hidden whitespace-nowrap font-display text-[15px] font-semibold tracking-tight",
              "transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
              collapsed ? "w-0 opacity-0" : "w-auto opacity-100",
            ].join(" ")}
            style={{ color: "var(--foreground)" }}
          >
            Daily<span style={{ color: "var(--primary)" }}>Bread</span>
          </span>
        </Link>

        {/* Collapse button — fades out when already collapsed */}
        <button
          onClick={toggle}
          aria-label="Collapse sidebar"
          className={[
            "flex shrink-0 items-center justify-center rounded-lg p-1.5",
            "transition-all duration-200",
            "hover:bg-[var(--sidebar-hover-bg)]",
            collapsed ? "pointer-events-none opacity-0" : "opacity-100",
          ].join(" ")}
          style={{ color: "var(--muted-foreground)" }}
        >
          <PanelLeftClose size={16} />
        </button>
      </div>

      {/* ── Nav ─────────────────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-hidden">
        <SidebarNav collapsed={collapsed} />
      </div>

      {/* ── Footer: expand trigger (collapsed) + user card ─── */}
      <div
        className="shrink-0"
        style={{ borderTop: "1px solid var(--sidebar-border)" }}
      >
        {/* Collapsed state: expand button + avatar dot */}
        <div
          className={[
            "flex flex-col items-center gap-2 py-3",
            "transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
            collapsed ? "opacity-100" : "pointer-events-none opacity-0 h-0 py-0 overflow-hidden",
          ].join(" ")}
        >
          {/* Expand button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={toggle}
                aria-label="Expand sidebar"
                className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors duration-200 hover:bg-[var(--sidebar-hover-bg)]"
                style={{ color: "var(--muted-foreground)" }}
              >
                <PanelLeftOpen size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              <span className="text-xs font-medium">Expand sidebar</span>
            </TooltipContent>
          </Tooltip>

          {/* Avatar dot */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className="flex h-8 w-8 cursor-default items-center justify-center rounded-full text-[11px] font-bold"
                style={{
                  backgroundColor: "var(--primary-subtle)",
                  color: "var(--primary)",
                }}
              >
                {initials}
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              <div className="flex flex-col gap-0.5">
                <p className="text-xs font-semibold">{displayName}</p>
                <p className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>
                  {session.role?.displayName ?? "Admin"}
                </p>
              </div>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Expanded state: full user card */}
        <div
          className={[
            "overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
            collapsed ? "max-h-0 opacity-0 pointer-events-none" : "max-h-24 opacity-100",
          ].join(" ")}
        >
          <div className="p-3">
            <div
              className="flex items-center gap-3 rounded-lg px-3 py-2.5"
              style={{ backgroundColor: "var(--sidebar-hover-bg)" }}
            >
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                style={{
                  backgroundColor: "var(--primary-subtle)",
                  color: "var(--primary)",
                }}
              >
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-sm font-semibold leading-tight"
                  style={{ color: "var(--foreground)" }}
                >
                  {displayName || "—"}
                </p>
                <p
                  className="truncate text-xs leading-tight"
                  style={{ color: "var(--muted-foreground)" }}
                >
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