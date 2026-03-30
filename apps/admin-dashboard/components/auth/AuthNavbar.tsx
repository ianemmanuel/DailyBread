import { BrandLogo } from "@/components/shared/BrandLogo";

/**
 * AuthNavbar — minimal top bar for the auth surface.
 * Brand mark on the left, secure portal indicator on the right.
 * Server component — no interactivity needed.
 */
export default function AuthNavbar() {
  return (
    <header
      className="h-14 flex items-center justify-between px-6 shrink-0
                 border-b border-[var(--border)] bg-[var(--deep)]"
    >
      <BrandLogo href="/" size="md" />

      <span className="flex items-center gap-2 text-xs font-mono tracking-wide text-[var(--muted-foreground)] select-none opacity-60">
        <span
          className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)]"
          aria-hidden="true"
        />
        Secure Portal
      </span>
    </header>
  );
}