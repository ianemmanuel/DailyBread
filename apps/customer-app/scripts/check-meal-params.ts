/*
 * Assertions for `mealParams` — the page's query string → the meals
 * endpoints' query string. Routes a real query object through the real mapper
 * (recurring bug class #1: a filter that typechecks and never reaches the
 * backend), and pins what must NOT travel.
 *
 *   pnpm dlx tsx scripts/check-meal-params.ts
 */
import { mealParams, PLACES_ONLY_FILTERS, type MealsQuery } from "../lib/data/market/meal-params"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok   ${label}`) }
  else { failed++; console.log(`  FAIL ${label}`, detail ?? "") }
}

const full: MealsQuery = {
  search: "  biryani ", cuisine: "cuisine-1", sort: "DISTANCE", hasOffer: "1", page: "2", pageSize: "24",
}

console.log("located feed")
{
  const p = mealParams(full, true)
  check("search is trimmed and forwarded", p.get("search") === "biryani", p.toString())
  check("cuisine travels as cuisineId", p.get("cuisineId") === "cuisine-1" && !p.has("cuisine"))
  check("sort is forwarded", p.get("sort") === "DISTANCE")
  check("hasOffer=1 becomes hasOffer=true", p.get("hasOffer") === "true")
  check("page and pageSize are forwarded", p.get("page") === "2" && p.get("pageSize") === "24")
}

console.log("city feed")
{
  const p = mealParams(full, false)
  check("no sort — the city endpoint takes none", !p.has("sort"), p.toString())
  check("every other filter still travels",
    p.get("search") === "biryani" && p.get("cuisineId") === "cuisine-1" && p.get("hasOffer") === "true")
}

console.log("what must not travel")
{
  const stray = { ...full, openNow: "1", freeDelivery: "1" } as MealsQuery
  const p = mealParams(stray, true)
  check("places-only filters are never sent", PLACES_ONLY_FILTERS.every((key) => !p.has(key)), p.toString())
  check("hasOffer other than 1 is not sent", !mealParams({ hasOffer: "0" }, true).has("hasOffer"))
  check("a blank search is not sent", !mealParams({ search: "   " }, false).has("search"))
  check("an empty query is empty", mealParams({}, true).size === 0)
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
