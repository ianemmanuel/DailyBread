import Link from 'next/link'

export function OnboardingFooter() {
  return (
    <footer className="border-t border-border/60 bg-white">
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center justify-between gap-3 px-4 py-5 sm:flex-row sm:px-6">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <Link href="/help"    className="transition-colors hover:text-foreground">Help</Link>
          <Link href="/terms"   className="transition-colors hover:text-foreground">Terms</Link>
          <Link href="/privacy" className="transition-colors hover:text-foreground">Privacy</Link>
          <Link href="/contact" className="transition-colors hover:text-foreground">Contact</Link>
        </div>
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} DailyBread. All rights reserved.
        </p>
      </div>
    </footer>
  )
}