import { Ban, CircleCheck, Clock, MailCheck, UserX, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

interface StatusStyle {
  label: string
  icon : LucideIcon
  pill : string
  dot  : string
  /** A live dot for states that are waiting on someone. */
  pulse?: boolean
}

const STYLES: Record<string, StatusStyle> = {
  active     : { label: "Active",      icon: CircleCheck, pill: "bg-emerald-50 text-emerald-700 ring-emerald-600/25", dot: "bg-emerald-500" },
  pending    : { label: "Pending",     icon: Clock,       pill: "bg-sky-50 text-sky-700 ring-sky-600/25",             dot: "bg-sky-500" },
  invited    : { label: "Invited",     icon: MailCheck,   pill: "bg-violet-50 text-violet-700 ring-violet-600/25",    dot: "bg-violet-500", pulse: true },
  suspended  : { label: "Suspended",   icon: Ban,         pill: "bg-amber-50 text-amber-800 ring-amber-600/30",       dot: "bg-amber-500" },
  deactivated: { label: "Deactivated", icon: UserX,       pill: "bg-slate-100 text-slate-600 ring-slate-500/25",      dot: "bg-slate-400" },
}

const FALLBACK: StatusStyle = { label: "", icon: Clock, pill: "bg-muted text-muted-foreground ring-border", dot: "bg-muted-foreground" }

/** `md` adds the status icon — for a details header; `sm` is the table size. */
export function UserStatusBadge({ status, size = "sm", className }: { status: string; size?: "sm" | "md"; className?: string }) {
  const style = STYLES[status] ?? { ...FALLBACK, label: status }
  const Icon = style.icon
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap ring-1 ring-inset",
        size === "md" ? "px-3 py-1 text-xs" : "px-2.5 py-0.5 text-xs",
        style.pill,
        className,
      )}
    >
      <span aria-hidden className="relative flex h-1.5 w-1.5">
        {style.pulse && <span className={cn("absolute inline-flex h-full w-full motion-safe:animate-ping rounded-full opacity-60", style.dot)} />}
        <span className={cn("relative inline-flex h-1.5 w-1.5 rounded-full", style.dot)} />
      </span>
      {size === "md" && <Icon aria-hidden className="h-3.5 w-3.5" />}
      {style.label}
    </span>
  )
}
