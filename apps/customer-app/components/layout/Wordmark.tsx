/*
 * The wordmark.
 *
 * Inline SVG rather than an <img>: it is two shapes, it must be crisp at any
 * density, it inherits the brand colour from CSS, and it costs no request. The
 * name is set in the display face so it matches the platform's typography
 * instead of being a picture of some other font.
 */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <svg
        viewBox="0 0 32 32"
        className="size-8 shrink-0"
        aria-hidden="true"
        fill="none"
      >
        {/* A loaf: a rounded dome on a base. */}
        <rect x="2" y="15" width="28" height="13" rx="4" fill="var(--primary)" />
        <path
          d="M4 16C4 9.9 9.4 5 16 5s12 4.9 12 11"
          fill="color-mix(in oklch, var(--primary) 78%, white)"
        />
        <path
          d="M11 10.5c1.6-1 3.2-1.5 5-1.5s3.4.5 5 1.5"
          stroke="var(--card)"
          strokeWidth="1.6"
          strokeLinecap="round"
          opacity="0.9"
        />
      </svg>
      <span className="font-display text-lg font-semibold tracking-tight text-[var(--foreground)]">
        DailyBread
      </span>
    </span>
  )
}
