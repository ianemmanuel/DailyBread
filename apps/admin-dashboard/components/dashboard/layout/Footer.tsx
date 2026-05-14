
export function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="shrink-0 border-t border-border/50 px-4 py-4 sm:px-6">
      <div className="flex flex-col items-center justify-between gap-1.5 sm:flex-row">
        {/* Copyright */}
        <p className="text-[11px] text-muted-foreground">
          &copy; {year}{" "}
          <span className="font-medium text-foreground/70">
            DailyBread Technologies
          </span>
        </p>

        {/* Right: version + environment tag */}
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-muted-foreground">
            v1.0.0
          </span>
          <span className="h-3 w-px bg-border" aria-hidden="true" />
          <span
            className="rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider"
            style={{
              backgroundColor: "var(--primary-subtle)",
              color: "var(--primary)",
            }}
          >
            Internal
          </span>
        </div>
      </div>
    </footer>
  )
}