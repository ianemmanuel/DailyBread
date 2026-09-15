
export function Logo({ className = "",tone = "default" }: { className?: string, tone?: "default" | "inverted"}) {
  return (
    <span
      className={`font-display text-2xl leading-none font-bold tracking-[-0.03em] lg:text-[1.75rem] ${className}`}
    >
      <span className={tone === "inverted" ? "text-deep-foreground" : "text-foreground"}>
        Daily
      </span>
      <span className="text-primary">Bread</span>
    </span>
  )
}
