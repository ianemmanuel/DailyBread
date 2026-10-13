export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="text-xs font-semibold uppercase tracking-widest pt-4"
      style={{ color: "var(--muted-foreground)" }}
    >
      {children}
    </h2>
  )
}