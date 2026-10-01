import { OutletCard } from "@/components/discovery/OutletCard"
import { AvailableCuisines } from "@/components/market/AvailableCuisines"
import { MarketRow, MarketSection } from "@/components/market/MarketSection"
import { MealCard } from "@/components/market/MealCard"
import { MealPlanCard } from "@/components/market/MealPlanCard"
import { ModeButton } from "@/components/market/ModeButton"
import { SampleBadge } from "@/components/market/SampleBadge"
import { getMarketMealPlans } from "@/lib/data/market/meal-plans"
import { PLACES_ONLY_FILTERS } from "@/lib/data/market/meal-params"
import { getMarketMeals } from "@/lib/data/market/meals"
import { getMarketPlaces, type PlacesQuery } from "@/lib/data/market/places"
import type { MarketList } from "@/lib/data/market/types"
import type { MarketScope } from "@/lib/market/context"
import { targetLabel } from "@/lib/market/resolve"

/*
 * The market's content rows, written ONCE and used by the city page (the
 * introduction) and the discover page (the exploration). Each row:
 *
 *   - reads through the one loader for its entity, passing the market SCOPE,
 *     so it is delivery-aware or city-wide with no branching of its own;
 *   - titles itself for the mode it is in ("Meals that reach Home" vs
 *     "Meals in Nairobi") — the customer always knows which question a row
 *     answers;
 *   - distinguishes failed / nothing here / not built yet (bug class #4), and
 *     in delivery mode offers to browse the whole city instead of a dead end;
 *   - links to its focused page with the same filters.
 *
 * Adding a row for a new entity is a loader + a card + one of these; the
 * pages do not change shape.
 */

interface RowProps {
  scope       : MarketScope
  limit?      : number
  query?      : PlacesQuery
  /** Omit the row entirely when it has nothing — for optional rows such as
   *  offers, where "none right now" is not worth a heading. */
  hideIfEmpty?: boolean
}

function base(scope: MarketScope) {
  return `/city/${scope.citySlug}`
}

function withQuery(path: string, query: PlacesQuery | undefined, keys: Array<keyof PlacesQuery>) {
  const params = new URLSearchParams()
  for (const key of keys) {
    const value = query?.[key]
    if (value) params.set(key, value)
  }
  return params.size ? `${path}?${params}` : path
}

/** "Places that deliver to Home" vs "Places in Nairobi". */
function titled(scope: MarketScope, thing: string, verb: string) {
  const city = scope.context.market.city.name
  return scope.mode === "delivery"
    ? `${thing} that ${verb} ${targetLabel(scope.target)}`
    : `${thing} in ${city}`
}

function Empty({ scope, children }: { scope: MarketScope; children: React.ReactNode }) {
  return (
    <div className="surface flex flex-col items-start gap-3 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm leading-relaxed text-muted-foreground">{children}</p>
      {scope.mode === "delivery" && (
        <ModeButton
          citySlug={scope.citySlug}
          browse
          label={`Browse all of ${scope.context.market.city.name}`}
          className="shrink-0"
        />
      )}
    </div>
  )
}

function Failed({ message }: { message: string }) {
  return (
    <p className="surface border-destructive/30 px-6 py-6 text-sm text-muted-foreground">
      {message} This is a problem on our side — please try again shortly.
    </p>
  )
}

function listNotice<T>(state: MarketList<T>, scope: MarketScope, noun: string) {
  const city = scope.context.market.city.name
  if (state.kind === "error") return <Failed message={state.message} />
  if (state.kind === "not-available") {
    return (
      <p className="surface px-6 py-8 text-sm text-muted-foreground">
        {noun[0]!.toUpperCase() + noun.slice(1)} are coming to {city} soon.
      </p>
    )
  }
  return null
}

// ─── Places — LIVE ───────────────────────────────────────────────────────────

export async function PlacesRow({ scope, limit = 8, query }: RowProps) {
  const state = await getMarketPlaces(scope, { ...query, pageSize: String(limit) })
  const city = scope.context.market.city.name
  const seeAllPath = withQuery(`${base(scope)}/places`, query, ["search", "cuisine", "openNow", "freeDelivery"])

  return (
    <MarketSection
      title={titled(scope, "Places", "deliver to")}
      description={scope.mode === "delivery"
        ? "Kitchens whose delivery area covers your address, in a zone we deliver to."
        : `Kitchens, restaurants and cafés selling in ${city}.`}
      seeAll={state.kind === "ok" && state.total > 0
        ? { href: seeAllPath, label: state.total > state.outlets.length ? `See all ${state.total}` : "See all places" }
        : undefined}
    >
      {state.kind === "error" ? <Failed message={state.message} />
        : state.outlets.length === 0 ? (
          <Empty scope={scope}>
            {scope.mode === "delivery"
              ? `No place is delivering to ${targetLabel(scope.target)} right now.`
              : query?.search || query?.cuisine
                ? "Nothing matches those filters."
                : `No places are open for orders in ${city} yet.`}
          </Empty>
        ) : (
          <MarketRow>
            {state.outlets.map((outlet, index) => (
              <OutletCard key={outlet.outletId} outlet={outlet} priority={index < 4} />
            ))}
          </MarketRow>
        )}
    </MarketSection>
  )
}

// ─── Offers — LIVE (places running a discount right now) ─────────────────────

export async function OffersRow({ scope, limit = 8, query, hideIfEmpty }: RowProps) {
  const state = await getMarketPlaces(scope, { ...query, hasOffer: "1", openNow: "1", pageSize: String(limit) })
  if (hideIfEmpty && (state.kind !== "ok" || state.outlets.length === 0)) return null

  return (
    <MarketSection
      title={scope.mode === "delivery" ? "Offers you can order now" : `Offers in ${scope.context.market.city.name}`}
      description="Discounts the kitchens themselves are running. They end when the kitchen says so."
      seeAll={{ href: `${base(scope)}/offers`, label: "See every offer" }}
    >
      {state.kind === "error" ? <Failed message={state.message} />
        : state.outlets.length === 0 ? <Empty scope={scope}>No kitchen is running an offer right now.</Empty>
        : (
          <MarketRow>
            {state.outlets.map((outlet) => <OutletCard key={outlet.outletId} outlet={outlet} />)}
          </MarketRow>
        )}
    </MarketSection>
  )
}

// ─── Cuisines — LIVE (what this market, or this address, actually carries) ───

export async function CuisinesRow({ scope, query, hideIfEmpty = true }: RowProps) {
  const state = await getMarketPlaces(scope, { search: query?.search, pageSize: "1" })
  if (state.kind !== "ok" || state.cuisines.length === 0) {
    return hideIfEmpty ? null : <Empty scope={scope}>No cuisines to show here yet.</Empty>
  }
  const city = scope.context.market.city.name

  return (
    <MarketSection
      title={scope.mode === "delivery" ? `Cuisines that reach ${targetLabel(scope.target)}` : `What ${city} is cooking`}
      description="Only cuisines that places here actually carry — every one leads somewhere."
      seeAll={{ href: `${base(scope)}/cuisines`, label: "All cuisines" }}
    >
      <AvailableCuisines cuisines={state.cuisines} basePath={`${base(scope)}/discover`} />
    </MarketSection>
  )
}

// ─── Meals — LIVE ────────────────────────────────────────────────────────────

export async function MealsRow({ scope, limit = 8, query }: RowProps) {
  const seeAll = { href: withQuery(`${base(scope)}/meals`, query, ["search", "cuisine"]), label: "See all meals" }

  /* Open now / free delivery narrow PLACES; the meals API does not apply them.
   * Showing meals under those chips would read as filtered when it is not, so
   * the row says so instead (and its "see all" drops them). */
  const placesOnly = PLACES_ONLY_FILTERS.filter((key) => query?.[key] === "1")
  if (placesOnly.length > 0) {
    return (
      <MarketSection title={titled(scope, "Meals", "reach")} seeAll={seeAll}>
        <p className="surface px-6 py-6 text-sm leading-relaxed text-muted-foreground">
          {placesOnly.map((key) => (key === "openNow" ? "Open now" : "Free delivery")).join(" and ")}
          {placesOnly.length > 1 ? " apply" : " applies"} to places only, so meals aren&apos;t listed under
          {placesOnly.length > 1 ? " them" : " it"}. See all meals for every dish in this search.
        </p>
      </MarketSection>
    )
  }

  const state = await getMarketMeals(scope, {
    search: query?.search, cuisine: query?.cuisine, sort: query?.sort, pageSize: String(limit),
  })

  return (
    <MarketSection
      title={titled(scope, "Meals", "reach")}
      description={scope.mode === "delivery"
        ? "Dishes from places that can deliver to your address."
        : `Dishes cooked across ${scope.context.market.city.name}.`}
      seeAll={state.kind === "ok" && state.total > 0
        ? { ...seeAll, label: state.total > state.meals.length ? `See all ${state.total}` : seeAll.label }
        : undefined}
    >
      {state.kind === "error" ? <Failed message={state.message} />
        : state.meals.length === 0 ? (
          <Empty scope={scope}>
            {scope.mode === "delivery"
              ? `No meals reach ${targetLabel(scope.target)} right now.`
              : query?.search || query?.cuisine
                ? "No meals match those filters."
                : `No meals are on sale in ${scope.context.market.city.name} yet.`}
          </Empty>
        ) : (
          <MarketRow>
            {state.meals.map((meal) => <MealCard key={meal.mealId} meal={meal} />)}
          </MarketRow>
        )}
    </MarketSection>
  )
}

// ─── Meal plans — SAMPLE until the read exists ───────────────────────────────

export async function MealPlansRow({ scope, limit = 6, query }: RowProps) {
  const state = await getMarketMealPlans(scope, { search: query?.search, cuisine: query?.cuisine, limit })

  return (
    <MarketSection
      title={titled(scope, "Meal plans", "deliver to")}
      description="Choose your meals once, choose the days, and one kitchen cooks through the week."
      badge={state.kind === "ok" && state.source === "sample" ? <SampleBadge /> : undefined}
      seeAll={{ href: `${base(scope)}/meal-plans`, label: "All meal plans" }}
    >
      {listNotice(state, scope, "meal plans") ?? (
        state.kind === "ok" && state.items.length === 0
          ? <Empty scope={scope}>{scope.mode === "delivery" ? "No plan delivers to this address yet." : "No meal plans match."}</Empty>
          : state.kind === "ok" && (
            <MarketRow columns={3}>
              {state.items.map((plan) => <MealPlanCard key={plan.id} plan={plan} />)}
            </MarketRow>
          )
      )}
    </MarketSection>
  )
}
