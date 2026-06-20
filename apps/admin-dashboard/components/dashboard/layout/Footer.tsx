export function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer
      className="shrink-0 border-t px-4 py-3 sm:px-6"
      style={{ borderColor: "var(--border)" }}
    >
      <div className="flex flex-col items-center justify-between gap-1.5 sm:flex-row">
        {/* Copyright */}
        <p className="text-[11px]" style={{ color: "var(--muted-foreground)" }}>
          &copy; {year}{" "}
          <span style={{ color: "var(--foreground)", opacity: 0.7, fontWeight: 500 }}>
            DailyBread Technologies
          </span>
        </p>

        {/* Version + environment */}
        <div className="flex items-center gap-2">
          <span
            className="font-mono text-[11px]"
            style={{ color: "var(--muted-foreground)" }}
          >
            v1.0.0
          </span>
          <span
            className="h-3 w-px"
            style={{ backgroundColor: "var(--border)" }}
            aria-hidden="true"
          />
          <span
            className="rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider"
            style={{
              backgroundColor: "var(--primary-subtle)",
              color:           "var(--primary)",
            }}
          >
            Internal
          </span>
        </div>
      </div>
    </footer>
  )
}