/*
 * The meal page's loading state — the real page's geometry (back link, square
 * photo beside the heading and price), so the swap is a fill, not a jolt.
 */
export default function MealLoading() {
  return (
    <div className="space-y-10 py-6 sm:py-8">
      <div className="shimmer h-4 w-36 rounded-md" />
      <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
        <div className="shimmer aspect-square w-full rounded-2xl" />
        <div className="space-y-4">
          <div className="shimmer h-3 w-24 rounded-md" />
          <div className="shimmer h-9 w-72 max-w-full rounded-lg" />
          <div className="shimmer h-5 w-48 rounded-md" />
          <div className="shimmer h-8 w-32 rounded-lg" />
          <div className="space-y-2 pt-2">
            <div className="shimmer h-4 w-full rounded-md" />
            <div className="shimmer h-4 w-5/6 rounded-md" />
          </div>
        </div>
      </div>
    </div>
  )
}
