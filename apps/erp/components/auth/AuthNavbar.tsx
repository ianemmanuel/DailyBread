import { BrandLogo } from "@/components/shared/BrandLogo";

/**
 * AuthNavbar — minimal top bar for the auth surface.
 * Brand mark left, secure portal indicator right.
 * Light warm theme — no dark mode on auth routes.
 * Server component.
 */
export default function AuthNavbar() {
  return (
    <header className="h-14 shrink-0 flex items-center justify-between px-6 border-b border-border bg-card">
      <BrandLogo href="/" size="md" />

      <span className="flex items-center gap-2 text-xs font-mono tracking-wide text-muted-foreground select-none">
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: "var(--color-success)" }}
          aria-hidden="true"
        />
        Secure Portal
      </span>
    </header>
  );
}