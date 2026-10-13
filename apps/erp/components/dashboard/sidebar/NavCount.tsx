/** A sidebar item's count of things waiting on the viewer. A number, so it never relies on colour alone. */
export function NavCount({ count, label }: { count: number; label: string }) {
  if (count <= 0) return null
  return (
    <span className="shrink-0 rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-semibold leading-none tabular-nums text-white">
      <span aria-hidden>{count > 99 ? "99+" : count}</span>
      <span className="sr-only">{label}: {count}</span>
    </span>
  )
}
