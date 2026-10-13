export default function Loading() {
  return (
    <div className="page-content" aria-busy="true" aria-label="Loading pending setups">
      <div className="admin-card h-20 animate-pulse bg-muted/40" />
      <div className="admin-card space-y-3">
        {Array.from({ length: 4 }, (_, i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-muted/40" />)}
      </div>
    </div>
  )
}
