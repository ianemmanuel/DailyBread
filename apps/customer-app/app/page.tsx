/*
 * The landing page.
 *
 * Deliberately empty — the sections from design-reference/design.png get built
 * here next. What matters at this point is what the file does NOT do: no
 * `export const dynamic`, no cookie read, no fetch. The route is therefore
 * statically rendered at build time, which is the whole reason the root layout
 * no longer reads cookies or auth.
 */
export default function HomePage() {
  return (
    <div className="shell band">
      <p className="text-sm text-muted-foreground">
        Landing page — coming next.
      </p>
    </div>
  )
}
