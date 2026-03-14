import Link from 'next/link'

export function DashboardFooter() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="mt-16 border-t border-border bg-white shadow-sm">
      <div className="mx-auto max-w-screen-xl px-4 py-8 sm:px-6">
        <div className="flex flex-col items-center justify-between gap-6 md:flex-row">

          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary shadow-sm">
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path
                  d="M10 2C6.5 2 4 5 4 8c0 2 1 3.5 2 4.5V15h8v-2.5C15 11.5 16 10 16 8c0-3-2.5-6-6-6z"
                  fill="white" fillOpacity="0.95"
                />
                <path
                  d="M7 15h6v1.5a1 1 0 01-1 1H8a1 1 0 01-1-1V15z"
                  fill="white" fillOpacity="0.7"
                />
              </svg>
            </div>
            <Link
              href="/dashboard"
              className="font-display text-lg font-semibold text-foreground transition-colors hover:text-primary"
            >
              Daily<span className="text-primary">Bread</span>
            </Link>
          </div>

          <p className="text-center text-sm text-muted-foreground">
            © {currentYear} DailyBread. Crafted meals with care.
          </p>

          <div className="flex gap-6 text-sm">
            {['Privacy', 'Terms', 'Support'].map((label) => (
              <Link
                key={label}
                href={`/${label.toLowerCase()}`}
                className="font-medium text-muted-foreground transition-colors hover:text-primary"
              >
                {label}
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-6 border-t border-border/50 pt-4">
          <div className="flex flex-col items-center justify-between gap-2 text-xs text-muted-foreground sm:flex-row">
            <p>Vendor Dashboard</p>
            <p>Designed for clarity and efficiency</p>
          </div>
        </div>
      </div>

      {/* Bottom accent — terracotta → gold, using real token values */}
      <div
        className="h-0.5 w-full opacity-40"
        style={{ background: 'linear-gradient(to right, var(--primary), var(--accent))' }}
      />
    </footer>
  )
}