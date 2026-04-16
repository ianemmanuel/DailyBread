"use client"

import { useState }    from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { Button }      from "@repo/ui/components/button"
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
import type { AdminRole } from "@/types"

interface Props {
  roles    : AdminRole[]
  value    : string
  onChange : (value: string) => void
}


export function RoleCombobox({ roles, value, onChange }: Props) {
  const [open, setOpen] = useState(false)

  const selected = roles.find((r) => r.id === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          {selected ? selected.displayName : "Select a role…"}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        style={{
          backgroundColor: "var(--popover)",
          border         : "1px solid var(--border)",
          borderRadius   : "var(--radius-md)",
        }}
        align="start"
      >
        <Command
          style={{ backgroundColor: "var(--popover)" }}
        >
          <CommandInput
            placeholder="Search roles…"
            className="h-9 text-sm"
            style={{ color: "var(--popover-foreground)" }}
          />
          <CommandList>
            <CommandEmpty className="py-4 text-center text-sm text-muted-foreground">
              No role found.
            </CommandEmpty>
            <CommandGroup>
              {roles.map((role) => (
                <CommandItem
                  key={role.id}
                  value={role.displayName}
                  onSelect={() => {
                    onChange(role.id)
                    setOpen(false)
                  }}
                  className="cursor-pointer"
                  style={{ color: "var(--popover-foreground)" }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 shrink-0 text-primary",
                      value === role.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{role.displayName}</p>
                    {role.description && (
                      <p className="text-xs text-muted-foreground truncate">{role.description}</p>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}