import Link from "next/link";

/**
 * AuthFooter — slim footer for auth pages.
 * Light warm theme — no dark mode on auth routes.
 * Server component.
 */
export default function AuthFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="shrink-0 border-t border-border bg-card py-4 px-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
        <p>&copy; {year} DailyBread Technologies. All rights reserved.</p>

        <nav className="flex items-center gap-4" aria-label="Footer links">
          <Link
            href="mailto:support@dailybread.com"
            className="hover:text-foreground transition-colors"
          >
            Support
          </Link>
          <span aria-hidden="true" className="text-border">·</span>
          <Link href="/privacy" className="hover:text-foreground transition-colors">
            Privacy
          </Link>
          <span aria-hidden="true" className="text-border">·</span>
          <Link href="/terms" className="hover:text-foreground transition-colors">
            Terms
          </Link>
        </nav>
      </div>
    </footer>
  );
}