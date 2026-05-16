
"use client"

import { useState, useMemo } from "react"
import { Check, ChevronsUpDown, Clock } from "lucide-react"
import { Button }  from "@repo/ui/components/button"
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from "@repo/ui/components/command"
import {
  Popover, 
  PopoverContent, 
  PopoverTrigger,
} from "@repo/ui/components/popover"
import { cn } from "@repo/ui/lib/utils"
import { getTimezoneOptions } from "@/utils/timezones"
import type { TimezoneOption } from "@/utils/timezones"

interface Props {
  value    : string
  onChange : (value: string) => void
  className?: string
  hasError?: boolean
}

export function TimezoneCombobox({ value, onChange, className, hasError }: Props) {
  const [open, setOpen] = useState(false)

  // Compute options once — memoised inside getTimezoneOptions()
  const options: TimezoneOption[] = useMemo(() => getTimezoneOptions(), [])

  const selected = options.find((o) => o.value === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between font-normal bg-background border-border",
            "hover:bg-muted text-sm",
            hasError && "border-destructive",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <span className="flex items-center gap-2 min-w-0">
            <Clock className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">
              {selected ? selected.label : "Select timezone…"}
            </span>
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-[420px] p-0 rounded-xl" align="start">
        <Command>
          <CommandInput
            placeholder="Search by city or region…"
            className="h-9 text-sm"
          />
          <CommandList className="max-h-[280px]">
            <CommandEmpty className="py-6 text-center text-sm text-muted-foreground">
              No timezone found.
            </CommandEmpty>
            <CommandGroup>
              {options.map((tz) => (
                <CommandItem
                  key={tz.value}
                  value={tz.value}
                  keywords={[tz.value, tz.label]}
                  onSelect={(v) => {
                    onChange(v)
                    setOpen(false)
                  }}
                  className="text-xs gap-2"
                >
                  <Check
                    className={cn(
                      "size-3.5 shrink-0",
                      value === tz.value ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span className="truncate">{tz.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}