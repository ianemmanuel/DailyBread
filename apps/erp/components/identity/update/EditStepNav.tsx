/** Jump links to the edit page's parts. */
export function EditStepNav({ steps }: { steps: Array<{ id: string; label: string }> }) {
  return (
    <nav aria-label="Edit sections" className="flex flex-wrap gap-1.5">
      {steps.map((s, i) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          className="group inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground shadow-xs transition-all hover:-translate-y-px hover:border-primary/40 hover:text-foreground hover:shadow-sm"
        >
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-foreground transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
            {i + 1}
          </span>
          {s.label}
        </a>
      ))}
    </nav>
  )
}
