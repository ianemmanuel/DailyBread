import Link from "next/link"
import { BrandMark } from "@/components/dashboard/brand/BrandMark"

export function DashboardFooter() {
  const currentYear = new Date().getFullYear()

  return (
    <footer
      className="mt-16 border-t"
      style={{
        background  : "var(--card)",
        borderColor : "var(--border)",
      }}
    >
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-16">
        <div className="flex flex-col items-center justify-between gap-6 md:flex-row">

          {/* Brand — the same wordmark as the sidebar and the customer app. */}
          <BrandMark />

          <p className="text-center text-sm text-[var(--muted-foreground)]">
            © {currentYear} DailyBread. Crafted meals with care.
          </p>

          <div className="flex gap-6 text-sm">
            {(["Privacy", "Terms", "Support"] as const).map((label) => (
              <Link
                key={label}
                href={`/${label.toLowerCase()}`}
                className="font-medium transition-colors text-[var(--muted-foreground)] hover:text-[var(--primary)]"
              >
                {label}
              </Link>
            ))}
          </div>
        </div>

        <div
          className="mt-6 border-t pt-4"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="flex flex-col items-center justify-between gap-2 text-xs text-[var(--muted-foreground)] sm:flex-row">
            <p>Vendor Dashboard</p>
            <p>Designed for clarity and efficiency</p>
          </div>
        </div>
      </div>

      {/* Wheat → gold accent line */}
      <div
        className="h-0.5 w-full opacity-30"
        style={{ background: "linear-gradient(to right, var(--primary), var(--accent))" }}
      />
    </footer>
  )
}