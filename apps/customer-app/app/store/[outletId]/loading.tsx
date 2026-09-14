/*
 * The storefront's loading state.
 *
 * Mirrors the real page's geometry exactly — hero height, the overlapping logo,
 * the two-column split, the menu rows — so the swap is a fill rather than a
 * jolt. A skeleton whose shape does not match what replaces it is worse than a
 * spinner, because the page visibly rearranges itself after it arrives.
 */
export default function StoreLoading() {
  return (
    <div className="pb-24">
      <div className="shimmer h-52 w-full sm:h-72" />

      <div className="shell relative -mt-10">
        <div className="shimmer size-20 rounded-2xl border-4 border-[var(--card)] sm:size-24" />

        <div className="mt-4 space-y-3 pb-6">
          <div className="shimmer h-8 w-64 max-w-full rounded-lg" />
          <div className="shimmer h-4 w-80 max-w-full rounded-md" />
          <div className="flex gap-2 pt-1">
            <div className="shimmer h-6 w-20 rounded-full" />
            <div className="shimmer h-6 w-24 rounded-full" />
          </div>
          <div className="flex gap-4 pt-1">
            <div className="shimmer h-4 w-16 rounded-md" />
            <div className="shimmer h-4 w-24 rounded-md" />
            <div className="shimmer h-4 w-20 rounded-md" />
          </div>
        </div>
      </div>

      <div className="shell grid gap-8 lg:grid-cols-[1fr_20rem] lg:items-start">
        <div className="space-y-6">
          <div className="shimmer h-7 w-40 rounded-lg" />
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="surface flex items-stretch gap-4 p-4">
                <div className="flex-1 space-y-2">
                  <div className="shimmer h-4 w-3/4 rounded-md" />
                  <div className="shimmer h-3 w-full rounded-md" />
                  <div className="shimmer h-3 w-2/3 rounded-md" />
                  <div className="shimmer mt-2 h-4 w-20 rounded-md" />
                </div>
                <div className="shimmer size-24 shrink-0 rounded-xl sm:size-28" />
              </div>
            ))}
          </div>
        </div>

        <div className="surface order-first space-y-3 p-5 lg:order-last">
          <div className="shimmer h-4 w-32 rounded-md" />
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="shimmer h-3 w-full rounded-md" />
          ))}
        </div>
      </div>
    </div>
  )
}
