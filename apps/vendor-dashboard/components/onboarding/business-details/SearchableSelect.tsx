"use client"

import { useState } from "react"
import { Check, ChevronsUpDown, Search } from "lucide-react"
import { Button } from "@repo/ui/components/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/ui/components/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@repo/ui/components/command"
import { cn } from "@repo/ui/lib/utils"

export interface SelectOption {
  value: string
  label: string
  sublabel?: string
}

interface SearchableSelectProps {
  options: SelectOption[]
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  disabled?: boolean
  className?: string
}

export function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = "Select an option",
  searchPlaceholder = "Search...",
  disabled = false,
  className,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const selected = options.find(o => o.value === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
                "relative h-10 w-full",
                "px-3 pr-9", // extra right padding for chevron space
                "border border-stone-200 rounded-md bg-white",
                "text-sm font-normal text-left",
                "hover:bg-stone-50 hover:border-stone-300",
                "focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-1",
                "disabled:cursor-not-allowed disabled:opacity-50",
                className
            )}
        >
            {/* Selected value display */}
            <span className="flex items-center gap-2 min-w-0">
                {selected ? (
                <>
                    <span className="truncate text-stone-800 text-sm">
                    {selected.label}
                    </span>
                    {selected.sublabel && (
                    <span className="text-stone-400 text-xs shrink-0 tabular-nums">
                        {selected.sublabel}
                    </span>
                    )}
                </>
                ) : (
                <span className="text-stone-400 text-sm">
                    {placeholder}
                </span>
                )}
            </span>

            {/* Chevron — absolutely positioned */}
            <ChevronsUpDown
                className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-400"
            />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className={cn(
          // Explicit white — no CSS variable dependency
          "p-0 bg-white border border-stone-200 rounded-md shadow-lg",
          // Override any inherited opacity/backdrop that could make it transparent
          "z-50"
        )}
        style={{ width: "var(--radix-popover-trigger-width)" }}
        align="start"
        sideOffset={4}
      >
        <Command className="bg-white rounded-md">

          {/* Search bar */}
          <div className="flex items-center gap-2 px-3 border-b border-stone-100 bg-white">
            <CommandInput
              placeholder={searchPlaceholder}
              // Strip ALL default Command input styles that could add borders/shadows
              className={cn(
                "h-9 flex-1 border-none outline-none ring-0 shadow-none",
                "bg-transparent text-sm text-stone-800 placeholder:text-stone-400",
                "focus:border-none focus:outline-none focus:ring-0 focus:shadow-none",
                // cmdk adds its own styles via [cmdk-input] — override
                "[[cmdk-input]]:border-none [[cmdk-input]]:shadow-none"
              )}
            />
          </div>

          <CommandList className="bg-white max-h-56 overflow-y-auto">
            <CommandEmpty className="py-8 text-center text-sm text-stone-400">
              No results found.
            </CommandEmpty>

            <CommandGroup className="bg-white p-1">
              {options.map(option => {
                const isSelected = value === option.value
                return (
                  <CommandItem
                    key={option.value}
                    value={`${option.label}${option.sublabel ? ` ${option.sublabel}` : ""}`}
                    onSelect={() => {
                      onValueChange(option.value)
                      setOpen(false)
                    }}
                    className={cn(
                      "flex items-center justify-between rounded-sm px-2 py-2 cursor-pointer",
                      "text-stone-800 bg-white",
                      "hover:bg-stone-50 aria-selected:bg-stone-100",
                      isSelected && "bg-stone-50"
                    )}
                  >
                    {/* Left: checkmark + label */}
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-4 h-4 shrink-0 flex items-center justify-center">
                        {isSelected && <Check className="h-3.5 w-3.5 text-stone-700" />}
                      </div>
                      <span className="text-sm text-stone-800 truncate">{option.label}</span>
                    </div>
                    {/* Right: sublabel */}
                    {option.sublabel && (
                      <span className="ml-3 text-xs text-stone-400 shrink-0 tabular-nums">
                        {option.sublabel}
                      </span>
                    )}
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>

        </Command>
      </PopoverContent>
    </Popover>
  )
}