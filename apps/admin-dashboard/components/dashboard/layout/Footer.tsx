export function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="shrink-0 border-t border-border/50 px-4 py-3 sm:px-6">
      <div className="flex flex-col items-center justify-between gap-1 sm:flex-row">
        <p className="text-[11px] text-muted-foreground/50">
          &copy; {year} DailyBread Technologies
        </p>
        <p className="font-mono text-[11px] text-muted-foreground/40">
          v1.0.0 · Internal use only
        </p>
      </div>
    </footer>
  )
}