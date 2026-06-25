"use client"

import type { ColumnDef } from "@tanstack/react-table"
import Link from "next/link"
import { MoreHorizontal, ArrowUpDown } from "lucide-react"
import { Button } from "@repo/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu"
import { cn } from "@repo/ui/lib/utils"
import type { CountrySummaryResult } from "@/types/geography.types"

/* ── Status badge ─────────────────────────────────────────── */
function StatusBadge({ status }: { status: string }) {
  const active = status === "ACTIVE"
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide",
        active
          ? "bg-success/12 text-success"
          : "bg-muted text-muted-foreground",
      )}
    >
      {active ? "Active" : "Inactive"}
    </span>
  )
}

/* ── Flag image with code fallback ───────────────────────────
   flagcdn.com — free, no key. Falls back to 2-letter code badge.
*/
function CountryFlag({ code }: { code: string }) {
  const cc = code.toLowerCase().slice(0, 2)
  return (
    <>
      <img
        src={`https://flagcdn.com/20x15/${cc}.png`}
        srcSet={`https://flagcdn.com/40x30/${cc}.png 2x`}
        width={20}
        height={15}
        alt={code}
        className="rounded-[2px] object-cover"
        onError={(e) => {
          e.currentTarget.style.display = "none"
          const next = e.currentTarget.nextElementSibling as HTMLElement | null
          if (next) next.style.display = "flex"
        }}
      />
      {/* Fallback — hidden until onError fires */}
      <span className="hidden h-[15px] w-[20px] items-center justify-center rounded-[2px] bg-muted text-[9px] font-bold text-muted-foreground">
        {code.slice(0, 2)}
      </span>
    </>
  )
}

/* ── Columns ──────────────────────────────────────────────── */
export const columns: ColumnDef<CountrySummaryResult>[] = [
  /* Country */
  {
    accessorKey: "name",
    header: ({ column }) => (
      <button
        className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      >
        Country
        <ArrowUpDown className="h-3 w-3" />
      </button>
    ),
    cell: ({ row }) => {
      const { name, code, slug } = row.original
      return (
        <Link href={`/countries/${slug}`} className="group flex items-center gap-2.5">
          <div className="relative flex shrink-0 items-center">
            <CountryFlag code={code} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight text-foreground transition-colors group-hover:text-primary">
              {name}
            </p>
            <p className="text-[11px] text-muted-foreground">{code}</p>
          </div>
        </Link>
      )
    },
    minSize: 160,
  },

  /* Region */
  {
    accessorKey: "region",
    header: () => <span className="text-xs font-medium text-muted-foreground">Region</span>,
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">{row.original.region ?? "—"}</span>
    ),
  },

  /* Cities */
  {
    id: "cities",
    header: () => <span className="text-xs font-medium text-muted-foreground">Cities</span>,
    cell: ({ row }) => (
      <span className="tabular-nums text-sm text-foreground">
        {row.original._count?.cities ?? 0}
      </span>
    ),
  },

  /* Vendors */
  {
    id: "vendors",
    header: () => <span className="text-xs font-medium text-muted-foreground">Vendors</span>,
    cell: ({ row }) => (
      <span className="tabular-nums text-sm text-foreground">
        {(row.original._count?.vendors ?? 0).toLocaleString()}
      </span>
    ),
  },

  /* Status */
  {
    accessorKey: "status",
    header: () => <span className="text-xs font-medium text-muted-foreground">Status</span>,
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },

  /* Actions — kebab only, all items are real <Link> navigations */
  {
    id: "actions",
    header: () => null,
    cell: ({ row }) => {
      const { slug, name } = row.original
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              aria-label={`More options for ${name}`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem asChild>
              <Link href={`/countries/${slug}`} className="flex w-full items-center">
                View dashboard
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/countries/${slug}/cities`} className="flex w-full items-center">
                Manage cities
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/countries/${slug}/vendors`} className="flex w-full items-center">
                Manage vendors
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/countries/${slug}/orders`} className="flex w-full items-center">
                View orders
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href={`/countries/${slug}/settings`} className="flex w-full items-center">
                Country settings
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  },
]