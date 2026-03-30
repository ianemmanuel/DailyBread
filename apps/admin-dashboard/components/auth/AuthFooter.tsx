import Link from "next/link";

/**
 * AuthFooter — slim footer for auth pages. Server component.
 */
export default function AuthFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="shrink-0 border-t border-[var(--border)] bg-[var(--deep)] py-4 px-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[var(--muted-foreground)] opacity-50">
        <p>&copy; {year} DailyBread Technologies. All rights reserved.</p>

        <nav className="flex items-center gap-4" aria-label="Footer links">
          <Link href="mailto:support@dailybread.com" className="hover:opacity-100 transition-opacity">
            Support
          </Link>
          <span aria-hidden="true">·</span>
          <Link href="/privacy" className="hover:opacity-100 transition-opacity">
            Privacy
          </Link>
          <span aria-hidden="true">·</span>
          <Link href="/terms" className="hover:opacity-100 transition-opacity">
            Terms
          </Link>
        </nav>
      </div>
    </footer>
  );
}