/**
 * Footer — slim bottom bar for all dashboard pages.
 * Server component. Uses CSS variables so theme works automatically.
 */
export function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer
      className="shrink-0 px-4 py-3 sm:px-6"
      style={{ borderTop: "1px solid color-mix(in oklch, var(--border) 50%, transparent)" }}
    >
      <div className="flex flex-col items-center justify-between gap-1 sm:flex-row">
        <p className="text-[11px]" style={{ color: "color-mix(in oklch, var(--muted-foreground) 50%, transparent)" }}>
          &copy; {year} DailyBread Technologies
        </p>
        <p className="font-mono text-[11px]" style={{ color: "color-mix(in oklch, var(--muted-foreground) 40%, transparent)" }}>
          v1.0.0 · Internal use only
        </p>
      </div>
    </footer>
  )
}