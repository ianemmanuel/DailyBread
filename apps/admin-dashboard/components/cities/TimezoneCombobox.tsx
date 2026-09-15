"use client"

import { useMemo, useState } from "react"
import { Check, ChevronsUpDown, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

interface Props {
  value   : string
  onChange: (value: string) => void
  /*
   * The timezones this city's COUNTRY actually uses (Country.timezones, seeded
   * for all 193 countries).
   *
   * Offering all ~420 IANA zones alphabetically is how both Kenyan cities ended
   * up on Africa/Addis_Ababa — one careless click, and nothing visibly broke
   * because it is also UTC+3. The backend now refuses a timezone outside the
   * country's own list; this stops it being offered in the first place.
   *
   * Omit or pass an empty list to fall back to every zone — a country with no
   * seeded timezones must not become unable to add cities.
   */
  countryTimezones?: readonly string[]
}

// Intl.supportedValuesOf("timeZone") — the IANA tz database baked into the
// JS engine itself (Node >=18.5, every evergreen browser). No npm package
// needed and no risk of drifting out of sync with a bundled copy.
const ALL_TIMEZONES: string[] = typeof Intl.supportedValuesOf === "function"
  ? Intl.supportedValuesOf("timeZone")
  : []

function formatOffset(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" }).formatToParts(new Date())
    return parts.find((p) => p.type === "timeZoneName")?.value ?? ""
  } catch {
    return ""
  }
}

/** Searchable timezone dropdown — backed by the platform's own IANA tz data. */
export function TimezoneCombobox({ value, onChange, countryTimezones }: Props) {
  const [open, setOpen] = useState(false)
  const [showAll, setShowAll] = useState(false)

  const scoped = countryTimezones?.filter((tz) => ALL_TIMEZONES.includes(tz)) ?? []
  const narrowed = scoped.length > 0 && !showAll

  const options = useMemo(
    () => (narrowed ? scoped : ALL_TIMEZONES)
      .map((tz) => ({ tz, label: tz.replace(/_/g, " "), offset: formatOffset(tz) })),
    [narrowed, scoped.join(",")],
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between rounded-xl font-normal"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{value ? value.replace(/_/g, " ") : "Select a timezone…"}</span>
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        style={{ backgroundColor: "var(--popover)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}
        align="start"
      >
        <Command style={{ backgroundColor: "var(--popover)" }}>
          <CommandInput placeholder="Search timezones…" className="h-9 text-sm" style={{ color: "var(--popover-foreground)" }} />
          <CommandList>
            <CommandEmpty className="py-4 text-center text-sm text-muted-foreground">No timezone found.</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => (
                <CommandItem
                  key={opt.tz}
                  value={opt.tz}
                  onSelect={() => { onChange(opt.tz); setOpen(false) }}
                  className="cursor-pointer"
                  style={{ color: "var(--popover-foreground)" }}
                >
                  <Check className={cn("mr-2 h-4 w-4 shrink-0 text-primary", value === opt.tz ? "opacity-100" : "opacity-0")} />
                  <span className="min-w-0 flex-1 truncate text-sm">{opt.label}</span>
                  {opt.offset && <span className="ml-2 shrink-0 text-xs text-muted-foreground">{opt.offset}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>

          {/* The escape hatch. A country's seeded zone list can be incomplete
              for a genuinely multi-zone territory, so an admin is never hard
              blocked — but the default is the correct short list, and choosing
              outside it is now a deliberate act. The backend still refuses
              anything the country does not use. */}
          {scoped.length > 0 && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="w-full cursor-pointer border-t px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
              style={{ borderColor: "var(--border)" }}
            >
              {narrowed
                ? `Showing the ${scoped.length === 1 ? "timezone" : `${scoped.length} timezones`} used in this country — show all instead`
                : "Show only this country's timezones"}
            </button>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  )
}
