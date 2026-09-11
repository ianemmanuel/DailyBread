import * as React from "react"
import { Label } from "@/components/ui/label"

/*
 * The two layout primitives every vendor form is built from.
 *
 * Extracted from ProfileForm so the meal form is the same shape by
 * construction rather than by imitation — a vendor moving between "create a
 * meal" and "edit your profile" should not be able to tell they were written
 * at different times.
 */

export function FormSection({
  icon: Icon, title, description, children, aside,
}: {
  icon       : React.ElementType
  title      : string
  description: string
  children   : React.ReactNode
  /** Optional top-right control, e.g. a counter or a small action. */
  aside?     : React.ReactNode
}) {
  return (
    <section className="dash-card flex flex-col p-5">
      <header className="mb-4 flex items-start gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="size-3.5 text-[var(--primary)]" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">{title}</h2>
          <p className="text-xs text-[var(--muted-foreground)]">{description}</p>
        </div>
        {aside}
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

/*
 * One labelled field. Required is marked with a red asterisk and optional
 * fields say nothing — marking both would make every row noisy, and the legend
 * above the submit button states the rule once.
 */
export function FormField({
  label, required, hint, counter, error, children,
}: {
  label    : string
  required?: boolean
  hint?    : string
  counter? : string
  error?   : string
  children : React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <Label className="text-sm">
          {label}
          {required && <span className="ml-0.5 text-[var(--destructive)]">*</span>}
        </Label>
        {counter && (
          <span className="shrink-0 text-xs text-[var(--muted-foreground)] tabular-nums">{counter}</span>
        )}
      </div>
      {children}
      {error
        ? <p className="text-xs text-[var(--destructive)]">{error}</p>
        : hint
          ? <p className="text-xs leading-relaxed text-[var(--muted-foreground)]">{hint}</p>
          : null}
    </div>
  )
}
