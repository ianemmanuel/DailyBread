import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

const TONES = {
  primary: "bg-primary/10 text-primary",
  info   : "bg-sky-100 text-sky-700",
  warning: "bg-amber-100 text-amber-800",
  success: "bg-emerald-100 text-emerald-700",
} as const

interface Props {
  id         : string
  step       : number
  icon       : LucideIcon
  tone       : keyof typeof TONES
  title      : string
  description: ReactNode
  children   : ReactNode
}

/** One numbered part of the edit page. Each part saves on its own. */
export function EditSection({ id, step, icon: Icon, tone, title, description, children }: Props) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 overflow-hidden rounded-xl border border-border bg-card shadow-xs">
      <header className="flex items-start gap-3 border-b border-border bg-muted/20 px-5 py-4">
        <div className={cn("relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", TONES[tone])}>
          <Icon aria-hidden className="h-5 w-5" />
          <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-[10px] font-semibold text-background">
            {step}
          </span>
        </div>
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="text-base font-semibold text-foreground">{title}</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
      </header>
      <div className="px-5 py-5">{children}</div>
    </section>
  )
}
