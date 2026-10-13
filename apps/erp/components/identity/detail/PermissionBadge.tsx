import { cn } from "@/lib/utils"
import { moduleLabel, permissionTitle } from "@/lib/identity/format"

/* One hue per module, so a long list reads by department at a glance. */
const MODULE_TONES = [
  { chip: "bg-sky-50 text-sky-800 ring-sky-600/20",             dot: "bg-sky-500" },
  { chip: "bg-violet-50 text-violet-800 ring-violet-600/20",    dot: "bg-violet-500" },
  { chip: "bg-emerald-50 text-emerald-800 ring-emerald-600/20", dot: "bg-emerald-500" },
  { chip: "bg-amber-50 text-amber-900 ring-amber-600/25",       dot: "bg-amber-500" },
  { chip: "bg-rose-50 text-rose-800 ring-rose-600/20",          dot: "bg-rose-500" },
  { chip: "bg-teal-50 text-teal-800 ring-teal-600/20",          dot: "bg-teal-500" },
  { chip: "bg-indigo-50 text-indigo-800 ring-indigo-600/20",    dot: "bg-indigo-500" },
  { chip: "bg-orange-50 text-orange-900 ring-orange-600/25",    dot: "bg-orange-500" },
]

export function moduleTone(module: string): { chip: string; dot: string } {
  let hash = 0
  for (const ch of module) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return MODULE_TONES[hash % MODULE_TONES.length]!
}

export interface PermissionSummary {
  key        : string
  module     : string
  description: string | null
}

export function PermissionBadge({ permission }: { permission: PermissionSummary }) {
  const tone = moduleTone(permission.module)
  return (
    <span
      title={permission.description ?? permission.key}
      className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset", tone.chip)}
    >
      <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", tone.dot)} />
      <span className="opacity-70">{moduleLabel(permission.module)}</span>
      <span aria-hidden className="opacity-40">/</span>
      {permissionTitle(permission.key)}
    </span>
  )
}
