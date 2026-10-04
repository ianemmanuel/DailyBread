/*
 * Assertions for the meal page's pure rules: the option PREVIEW
 * (`lib/meal/selection.ts`), the gallery (`lib/meal/gallery.ts`), the meta
 * description (`lib/meal/meta.ts`), the price summary's wording
 * (`lib/meal/summary.ts`), outlet identity (`lib/format/outlet.ts`), and money
 * formatting at every scale the backend sends.
 *
 *   pnpm dlx tsx scripts/check-meal-selection.ts
 */
import type { CustomerCurrency, MenuImage, StorefrontModifierGroup } from "@repo/types/customer-app"

import { formatMoney, formatMoneyCompact } from "../lib/format/money"
import { outletIdentity, outletLabel } from "../lib/format/outlet"
import { listJoin, summaryWording } from "../lib/meal/summary"
import { galleryImages, photoLabel, stepIndex } from "../lib/meal/gallery"
import { mealMetaDescription } from "../lib/meal/meta"
import { groupState, previewPrice, selectionRule, toggleOption } from "../lib/meal/selection"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok   ${label}`) }
  else { failed++; console.log(`  FAIL ${label}`, detail ?? "") }
}

const group = (
  id: string, minSelect: number, maxSelect: number,
  options: Array<[string, number, boolean?]>,
): StorefrontModifierGroup => ({
  id, name: id, description: null, minSelect, maxSelect, isRequired: minSelect >= 1,
  options: options.map(([oid, delta, available = true]) => ({
    id: oid, name: oid, priceDeltaMinor: delta, isAvailable: available,
  })),
})

const size   = group("size", 1, 1, [["regular", 0], ["large", 2000], ["huge", 4000, false]])
const extras = group("extras", 0, 2, [["cheese", 300], ["egg", 150], ["bacon", 500]])
const sauces = group("sauces", 2, 3, [["bbq", 0], ["mayo", 0], ["chili", 50, false]])

console.log("toggleOption")
{
  check("nothing is pre-selected: an untouched group is empty", previewPrice(1000, [size], {}).hasChoices === false)
  check("single choice selects", toggleOption(size, [], "regular").join() === "regular")
  check("single choice SWAPS", toggleOption(size, ["regular"], "large").join() === "large")
  check("activating a chosen option un-chooses it", toggleOption(size, ["large"], "large").length === 0)
  check("an unavailable option cannot be chosen", toggleOption(size, [], "huge").length === 0)
  check("a foreign option id changes nothing", toggleOption(size, ["regular"], "cheese").join() === "regular")
  check("multi choice adds", toggleOption(extras, ["cheese"], "egg").join() === "cheese,egg")
  check("multi choice at its max refuses — never drops an earlier choice",
    toggleOption(extras, ["cheese", "egg"], "bacon").join() === "cheese,egg")
  check("choices are kept in the vendor's option order",
    toggleOption(extras, ["bacon"], "cheese").join() === "cheese,bacon")
}

console.log("groupState")
{
  check("optional and empty is a valid answer", groupState(extras, []).kind === "optional")
  const needs = groupState(sauces, ["bbq"])
  check("required and short says how many more", needs.kind === "needs" && needs.remaining === 1, needs)
  const done = groupState(extras, ["cheese"])
  check("within max says more may be added", done.kind === "complete" && done.canAddMore, done)
  const full = groupState(extras, ["cheese", "egg"])
  check("at max says no more", full.kind === "complete" && !full.canAddMore, full)
  const blocked = group("blocked", 2, 2, [["a", 0], ["b", 0, false]])
  check("required with too few AVAILABLE options is blocked", groupState(blocked, []).kind === "blocked")
}

console.log("previewPrice")
{
  const p = previewPrice(1000, [size, extras], { size: ["large"], extras: ["cheese", "egg"] })
  check("list price + every chosen delta", p.optionsMinor === 2450 && p.totalMinor === 3450, p)
  check("a satisfied selection has nothing incomplete", p.incomplete.length === 0, p.incomplete)

  const short = previewPrice(1000, [size, sauces], { sauces: ["bbq"] })
  check("required groups still short are named", short.incomplete.join() === "size,sauces", short.incomplete)

  const stale = previewPrice(1000, [size, extras], { size: ["huge"], extras: ["cheese", "egg", "bacon"] })
  check("an unavailable or over-max id cannot move the figure", stale.optionsMinor === 450 && stale.totalMinor === 1450, stale)

  const negative = group("smaller", 0, 1, [["half", -1500]])
  const n = previewPrice(1000, [negative], { smaller: ["half"] })
  check("a negative sum is NOT clamped to a made-up zero — no figure at all", n.totalMinor === null && n.optionsMinor === -1500, n)

  const zeroDigit = previewPrice(1500, [group("x", 0, 1, [["big", 500]])], { x: ["big"] })
  check("zero-decimal currencies add as plain integers", zeroDigit.totalMinor === 2000, zeroDigit)
}

console.log("selectionRule")
{
  check("required exact", selectionRule(size) === "Required · choose 1")
  check("required range", selectionRule(sauces) === "Required · choose 2–3")
  check("optional up to n", selectionRule(extras) === "Optional · up to 2")
  check("optional with max covering every option",
    selectionRule(group("any", 0, 3, [["a", 0], ["b", 0], ["c", 0]])) === "Optional · choose any")
  check("optional single", selectionRule(group("one", 0, 1, [["a", 0], ["b", 0]])) === "Optional · up to 1")
}

console.log("gallery")
{
  const img = (url: string): MenuImage => ({ url, width: 1600, height: 1200, blurDataUrl: "data:" })
  const list = [img("main"), img("second"), img("third")]
  check("server order is kept, main first",
    galleryImages({ image: list[0]!, images: list }).map((i) => i.url).join() === "main,second,third")
  check("`image` alone is the fallback when `images` is empty",
    galleryImages({ image: img("only"), images: [] }).map((i) => i.url).join() === "only")
  check("no photos is an empty gallery, not a broken one", galleryImages({ image: null, images: [] }).length === 0)
  check("next wraps from last to first", stepIndex(2, 1, 3) === 0)
  check("previous wraps from first to last", stepIndex(0, -1, 3) === 2)
  check("a single photo never moves", stepIndex(0, 1, 1) === 0)
  check("labels count from one", photoLabel("Pilau", 1, 3) === "Pilau, photo 2 of 3")
  check("a single photo is just the dish's name", photoLabel("Pilau", 0, 1) === "Pilau")
}

console.log("meta description")
{
  const base = { name: "Pilau", outlet: { name: "Westlands", displayName: "Mama's" }, city: { name: "Nairobi" } }
  check("the vendor's own words when there are any",
    mealMetaDescription({ ...base, description: "Spiced rice,\n slow cooked." }) === "Spiced rice, slow cooked.")
  check("a plain statement of what and where otherwise",
    mealMetaDescription({ ...base, description: null }) === "Pilau from Westlands · by Mama's, in Nairobi.")
  const long = mealMetaDescription({ ...base, description: "word ".repeat(80) })
  check("long copy is cut on a word boundary under the limit", long.length <= 155 && long.endsWith("…") && !long.includes("wor…"), long)
}

console.log("money at every scale")
{
  const kes: CustomerCurrency = { code: "KES", symbol: "KSh", minorUnitDigits: 2 } as CustomerCurrency
  const ugx: CustomerCurrency = { code: "UGX", symbol: "USh", minorUnitDigits: 0 } as CustomerCurrency
  const kwd: CustomerCurrency = { code: "KWD", symbol: "KD", minorUnitDigits: 3 } as CustomerCurrency
  check("KES 2 digits: 120000 minor is 1,200", formatMoneyCompact(120000, kes).includes("1,200") && !formatMoneyCompact(120000, kes).includes(".00"), formatMoneyCompact(120000, kes))
  check("UGX 0 digits: 15000 minor is 15,000, never 150", formatMoneyCompact(15000, ugx).includes("15,000"), formatMoneyCompact(15000, ugx))
  check("KWD 3 digits: 1500 minor is 1.500", formatMoney(1500, kwd).includes("1.500"), formatMoney(1500, kwd))
}

console.log("outlet identity")
{
  const westlands = outletIdentity({ name: "Westlands", displayName: "Mama's Kitchen" })
  check("the OUTLET name leads, the business is attribution",
    westlands.name === "Westlands" && westlands.vendor === "Mama's Kitchen", westlands)
  const karen = outletIdentity({ name: "Karen", displayName: "Mama's Kitchen" })
  check("two outlets of one vendor are told apart", karen.name !== westlands.name && karen.vendor === westlands.vendor)
  check("no byline when it would only repeat the outlet name",
    outletIdentity({ name: "Mama's Kitchen", displayName: "Mama's Kitchen" }).vendor === null)
  check("no byline when the outlet name already contains the business",
    outletIdentity({ name: "Mama's Kitchen Westlands", displayName: "mama's kitchen" }).vendor === null)
  check("a blank outlet name falls back to the business, never to nothing",
    outletIdentity({ name: "  ", displayName: "Mama's Kitchen" }).name === "Mama's Kitchen")
  check("one-line label for titles",
    outletLabel({ name: "Westlands", displayName: "Mama's Kitchen" }) === "Westlands · by Mama's Kitchen")
}

console.log("price summary wording")
{
  const vatIn = { label: "VAT 16%", inclusive: true }
  const vatOut = { label: "Sales tax 8%", inclusive: false }

  const plain = summaryWording({ optionsMinor: 0, hasChoices: false, offerLabel: null, tax: vatIn })
  check("no offer: nothing about an offer either way",
    !plain.showOfferPrice && !plain.included.join().includes("offer") && !plain.excluded.join().includes("offer"), plain)
  check("inclusive tax is named as included", plain.included.some((l) => l.startsWith("VAT 16%")), plain.included)
  check("delivery is always named as excluded", plain.excluded.includes("delivery"), plain.excluded)

  const offerNoChoice = summaryWording({ optionsMinor: 0, hasChoices: false, offerLabel: "20% off", tax: null })
  check("an offer with no priced choices: the server's offer price is the bottom line",
    offerNoChoice.showOfferPrice && offerNoChoice.included.includes("the 20% off offer"), offerNoChoice)

  const offerZeroChoice = summaryWording({ optionsMinor: 0, hasChoices: true, offerLabel: "20% off", tax: null })
  check("…still true when the choices add nothing (the meal is priced as the server priced it)",
    offerZeroChoice.showOfferPrice, offerZeroChoice)

  const offerChoice = summaryWording({ optionsMinor: 200, hasChoices: true, offerLabel: "20% off", tax: vatOut })
  check("an offer with priced choices is EXCLUDED, never re-derived",
    !offerChoice.showOfferPrice && offerChoice.excluded.some((l) => l.startsWith("the 20% off offer")), offerChoice)
  check("exclusive tax is named as excluded, never as included",
    offerChoice.excluded.some((l) => l.startsWith("Sales tax 8%")) && !offerChoice.included.join().includes("Sales tax"), offerChoice)
  check("an unconfigured tax is said nowhere",
    !summaryWording({ optionsMinor: 0, hasChoices: false, offerLabel: null, tax: null }).included.join().includes("tax"))
  check("lists read as a sentence", listJoin(["a", "b", "c"]) === "a, b and c" && listJoin(["a"]) === "a")
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
