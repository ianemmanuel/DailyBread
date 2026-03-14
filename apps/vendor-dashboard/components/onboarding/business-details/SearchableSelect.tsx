'use client'

import { useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { Button } from '@repo/ui/components/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@repo/ui/components/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@repo/ui/components/command'
import { cn } from '@repo/ui/lib/utils'

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
  placeholder = 'Select an option',
  searchPlaceholder = 'Search...',
  disabled = false,
  className,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const selected = options.find((o) => o.value === value)

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
            'relative h-10 w-full justify-start px-3 pr-9',
            'border-input bg-white text-sm font-normal',
            'hover:bg-secondary/40 hover:border-ring/50',
            'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
            'disabled:cursor-not-allowed disabled:opacity-50',
            className
          )}
        >
          <span className="flex min-w-0 items-center gap-2">
            {selected ? (
              <>
                <span className="truncate text-sm text-foreground">{selected.label}</span>
                {selected.sublabel && (
                  <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                    {selected.sublabel}
                  </span>
                )}
              </>
            ) : (
              <span className="text-sm text-muted-foreground">{placeholder}</span>
            )}
          </span>
          <ChevronsUpDown className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="z-50 p-0 border-border bg-white shadow-lg"
        style={{ width: 'var(--radix-popover-trigger-width)' }}
        align="start"
        sideOffset={4}
      >
        <Command className="bg-white">
          <div className="border-b border-border/60 px-3">
            <CommandInput
              placeholder={searchPlaceholder}
              className={cn(
                'h-9 flex-1 border-none bg-transparent text-sm',
                'placeholder:text-muted-foreground text-foreground',
                'focus:outline-none focus:ring-0 focus:shadow-none',
              )}
            />
          </div>

          <CommandList className="max-h-56 overflow-y-auto">
            <CommandEmpty className="py-8 text-center text-sm text-muted-foreground">
              No results found.
            </CommandEmpty>
            <CommandGroup className="p-1">
              {options.map((option) => {
                const isSelected = value === option.value
                return (
                  <CommandItem
                    key={option.value}
                    value={`${option.label}${option.sublabel ? ` ${option.sublabel}` : ''}`}
                    onSelect={() => {
                      onValueChange(option.value)
                      setOpen(false)
                    }}
                    className={cn(
                      'flex cursor-pointer items-center justify-between rounded-md px-2 py-2 text-sm',
                      'text-foreground hover:bg-secondary/60 aria-selected:bg-secondary/60',
                      isSelected && 'bg-secondary/40'
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="flex h-4 w-4 shrink-0 items-center justify-center">
                        {isSelected && <Check className="h-3.5 w-3.5 text-primary" />}
                      </div>
                      <span className="truncate">{option.label}</span>
                    </div>
                    {option.sublabel && (
                      <span className="ml-3 shrink-0 tabular-nums text-xs text-muted-foreground">
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