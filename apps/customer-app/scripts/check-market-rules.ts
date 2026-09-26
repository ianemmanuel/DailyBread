/*
 * Assertions for the two pure rules market navigation rests on — the
 * per-market delivery cookie and `resolveMarketChoice`. This app has no test
 * runner; these need no DOM and no network, so a plain script is enough.
 *
 *   pnpm dlx tsx scripts/check-market-rules.ts
 */
import type { CustomerAddress } from "@repo/types/customer-app"
import {
  parseDeliveryCookie, parseLastMarket, serializeDeliveryCookie, serializeLastMarket,
  withChoice, withoutAddress,
} from "../lib/location/cookie"
import { resolveMarketChoice } from "../lib/market/resolve"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok   ${label}`) }
  else { failed++; console.log(`  FAIL ${label}`, detail ?? "") }
}

const address = (id: string, citySlug: string): CustomerAddress => ({
  id, label: id, addressLine1: `${id} street`, addressLine2: null, city: "x", postalCode: null,
  countryId: "ke", latitude: 0, longitude: 0, isDefault: false, createdAt: "2026-01-01T00:00:00Z",
  serviceability: {
    status: "SERVICEABLE", isServiceable: true, zoneId: "z", zoneName: "Zone", platformDelivers: true,
    vendorMaySelfDeliver: true, cityId: citySlug, cityName: citySlug, citySlug, countryId: "ke",
  },
})

console.log("cookie")
{
  const empty = parseDeliveryCookie(undefined)
  const one = withChoice(empty, "nairobi-ke", { mode: "deliver", target: { kind: "address", addressId: "home" } })
  const raw = serializeDeliveryCookie(one)
  check("round-trips as plain JSON (server side)", parseDeliveryCookie(raw).markets["nairobi-ke"]?.mode === "deliver")
  check("and as the browser sees it, percent-encoded once",
    parseDeliveryCookie(encodeURIComponent(raw)).markets["nairobi-ke"]?.target?.kind === "address")
  check("a v1 cookie reads as nothing chosen",
    Object.keys(parseDeliveryCookie(JSON.stringify({ latitude: 1, longitude: 2, label: "x" })).markets).length === 0)
  check("garbage reads as nothing chosen", Object.keys(parseDeliveryCookie("%%%not json").markets).length === 0)
  check("deliver without a target is discarded",
    !parseDeliveryCookie(JSON.stringify({ v: 2, markets: { "a-b": { mode: "deliver", target: null, at: 1 } } })).markets["a-b"])
  check("an out-of-range pin is discarded",
    !parseDeliveryCookie(JSON.stringify({ v: 2, markets: { "a-b": { mode: "deliver", target: { kind: "pin", latitude: 99, longitude: 0 }, at: 1 } } })).markets["a-b"])
  check("a non-slug key is discarded",
    !parseDeliveryCookie(JSON.stringify({ v: 2, markets: { "../x": { mode: "browse", target: null, at: 1 } } })).markets["../x"])

  let many = empty
  for (let i = 0; i < 15; i++) many = withChoice(many, `city-${i}`, { mode: "browse", target: null })
  check("caps the number of markets, dropping the oldest",
    Object.keys(many.markets).length === 12 && !many.markets["city-0"] && Boolean(many.markets["city-14"]))

  const two = withChoice(one, "mombasa-ke", { mode: "browse", target: { kind: "address", addressId: "home" } })
  const pruned = withoutAddress(two, "home")
  check("forgetting an address drops a market that delivered to it", !pruned.markets["nairobi-ke"])
  check("and keeps a browsing market, with nothing to return to",
    pruned.markets["mombasa-ke"]?.mode === "browse" && pruned.markets["mombasa-ke"]?.target === null)

  const last = serializeLastMarket({ slug: "nairobi-ke", name: "Nairobi" })
  check("last market parses on both sides",
    parseLastMarket(last)?.name === "Nairobi" && parseLastMarket(encodeURIComponent(last))?.slug === "nairobi-ke")
}

console.log("resolveMarketChoice")
{
  const home = address("home", "nairobi-ke")
  const work = address("work", "nairobi-ke")
  const inCity = [work, home]

  const none = resolveMarketChoice(undefined, [], null)
  check("nothing chosen and no address → browse, reason nothing", none.mode === "browse" && none.reason === "nothing")

  const byDefault = resolveMarketChoice(undefined, inCity, "home")
  check("nothing chosen on this device → the CITY default applies",
    byDefault.mode === "delivery" && byDefault.target.kind === "address"
      && byDefault.target.address.id === "home" && byDefault.target.source === "default")

  const selected = resolveMarketChoice({ mode: "deliver", target: { kind: "address", addressId: "work" }, at: 1 }, inCity, "home")
  check("a device selection beats the default, without changing it",
    selected.mode === "delivery" && selected.target.kind === "address" && selected.target.address.id === "work"
      && selected.target.source === "selected")

  const stale = resolveMarketChoice({ mode: "deliver", target: { kind: "address", addressId: "gone" }, at: 1 }, inCity, "home")
  check("a selection that is not in this city's book falls back to the default",
    stale.mode === "delivery" && stale.target.kind === "address" && stale.target.address.id === "home")

  const signedOut = resolveMarketChoice({ mode: "deliver", target: { kind: "address", addressId: "home" }, at: 1 }, [], null)
  check("signed out, an address selection resolves to nothing (no leaked label)", signedOut.mode === "browse")

  const browsing = resolveMarketChoice({ mode: "browse", target: { kind: "address", addressId: "work" }, at: 1 }, inCity, "home")
  check("browse wins even with addresses — and keeps what to return to",
    browsing.mode === "browse" && browsing.reason === "chosen"
      && browsing.target?.kind === "address" && browsing.target.address.id === "work")

  const browseNoCookieTarget = resolveMarketChoice({ mode: "browse", target: null, at: 1 }, inCity, "home")
  check("browse with no remembered target returns to the city default",
    browseNoCookieTarget.mode === "browse" && browseNoCookieTarget.target?.kind === "address"
      && browseNoCookieTarget.target.address.id === "home")

  const pin = resolveMarketChoice(
    { mode: "deliver", target: { kind: "pin", latitude: -1.3, longitude: 36.8, label: "Karen" }, at: 1 }, [], null)
  check("an anonymous pin delivers", pin.mode === "delivery" && pin.target.kind === "pin")
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exitCode = 1
