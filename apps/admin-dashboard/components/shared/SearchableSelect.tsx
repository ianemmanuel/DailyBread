"use client"

import type { ComponentType } from "react"
import { useState } from "react"
import { Check, ChevronsUpDown, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

/**
 * The one searchable select in this app — a shadcn Command inside a Popover.
 *
 * Three near-identical copies of this existed (TableFilterBar's country/category
 * pickers, RevenueCountrySelect, and a plain <Select> at every other country
 * picker). Every list an admin picks from here is long enough to want typing
 * rather than scrolling — there are 193 countries — so this is the default, and
 * a plain <Select> is now only right for a genuinely short fixed list
 * (a status, a direction, a policy).
 *
 * Deliberately unaware of URLs and forms: callers own what a change means, which
 * is why the same component serves a filter bar that pushes a query string, a
 * dialog that holds local state, and a form field.
 */

export interface SearchableOption {
  value: string
  label: string
  /** Optional second line — a code, a country, a count. */
  hint?: string
}

export interface SearchableSelectProps {
  options : SearchableOption[]
  value   : string
  onChange: (value: string) => void
  /** Prepended as a "no filter" row. Omit for a required single choice. */
  allOption?        : SearchableOption
  /** Trigger text while nothing is selected. */
  placeholder?      : string
  searchPlaceholder?: string
  /** What the empty search result says, e.g. "No country found." */
  emptyLabel?       : string
  icon?             : ComponentType<{ className?: string }>
  disabled?         : boolean
  /** Shows a spinner in place of the icon — for an in-flight navigation. */
  loading?          : boolean
  /** Trigger classes; pass a width here. Defaults to full width. */
  className?        : string
  align?            : "start" | "end" | "center"
  "aria-label"?     : string
  id?               : string
}

const triggerStyle = { backgroundColor: "var(--input)", color: "var(--foreground)" }
const contentStyle = {
  backgroundColor: "var(--popover)",
  color          : "var(--popover-foreground)",
  border         : "1px solid var(--border)",
}

export function SearchableSelect({
  options,
  value,
  onChange,
  allOption,
  placeholder       = "Select…",
  searchPlaceholder = "Search…",
  emptyLabel        = "Nothing found.",
  icon: Icon,
  disabled          = false,
  loading           = false,
  className,
  align             = "start",
  id,
  ...rest
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false)

  const selected = value === allOption?.value
    ? allOption
    : options.find((o) => o.value === value)

  function pick(next: string) {
    setOpen(false)
    onChange(next)
  }

  return (
    <Popover open={open} onOpenChange={(o) => !disabled && setOpen(o)}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={rest["aria-label"]}
          disabled={disabled}
          className={cn("w-full justify-between rounded-full font-normal", className)}
          style={triggerStyle}
        >
          <span className="flex min-w-0 items-center gap-2">
            {loading
              ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
              : Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
            <span className={cn("truncate", !selected && "text-muted-foreground")}>
              {selected?.label ?? placeholder}
            </span>
          </span>
          {!disabled && <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] rounded-xl p-0"
        style={contentStyle}
        align={align}
      >
        <Command style={{ backgroundColor: "var(--popover)" }}>
          <CommandInput
            placeholder={searchPlaceholder}
            className="h-9 text-sm"
            style={{ color: "var(--popover-foreground)" }}
          />
          <CommandList>
            <CommandEmpty className="py-4 text-center text-sm text-muted-foreground">
              {emptyLabel}
            </CommandEmpty>
            <CommandGroup>
              {allOption && (
                <Row
                  option={allOption}
                  selected={value === allOption.value}
                  onSelect={() => pick(allOption.value)}
                />
              )}
              {options.map((option) => (
                <Row
                  key={option.value}
                  option={option}
                  selected={value === option.value}
                  onSelect={() => pick(option.value)}
                />
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/* `value` is what Command filters on, so it carries the hint too — searching
 * "KE" should find Kenya by its code, not only by its name. */
function Row({
  option, selected, onSelect,
}: { option: SearchableOption; selected: boolean; onSelect: () => void }) {
  return (
    <CommandItem
      value={option.hint ? `${option.label} ${option.hint}` : option.label}
      onSelect={onSelect}
      className="cursor-pointer"
      style={{ color: "var(--popover-foreground)" }}
    >
      <Check className={cn("h-4 w-4 shrink-0 text-primary", selected ? "opacity-100" : "opacity-0")} />
      <span className="min-w-0 flex-1 truncate">{option.label}</span>
      {option.hint && <span className="shrink-0 text-xs text-muted-foreground">{option.hint}</span>}
    </CommandItem>
  )
}
