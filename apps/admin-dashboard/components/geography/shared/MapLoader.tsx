// components/geography/shared/MapLoader.tsx
// Wrapper that shows a skeleton while the heavy Mapbox bundle loads.
// All map components MUST use this wrapper — Mapbox requires `window`,
// so it can never be server-side rendered.

import dynamic      from "next/dynamic"
import { Skeleton } from "@repo/ui/components/skeleton"
import { Map }      from "lucide-react"

export function MapSkeleton({ height = "h-full" }: { height?: string }) {
  return (
    <div className={`relative w-full ${height} overflow-hidden rounded-xl border border-border/60`}>
      <Skeleton className="absolute inset-0 rounded-xl" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10">
          <Map className="size-6 text-primary animate-pulse" />
        </div>
        <p className="text-sm text-muted-foreground">Loading map…</p>
      </div>
    </div>
  )
}

// Factory — creates a dynamically imported map component with no SSR.
// Usage:
//   const BoundaryMap = createMapComponent(() => import("./boundary/BoundaryMapInner"))
export function createDynamicMap<T extends object>(
  loader: () => Promise<{ default: React.ComponentType<T> }>,
  height = "h-full",
) {
  return dynamic(loader, {
    ssr    : false,
    loading: () => <MapSkeleton height={height} />,
  })
}