import { describe, it, expect } from "vitest"
import { normalizeDishGroups, planOptionWrites, groupTextChanged, asideName, groupContentKey, type StoredOption } from "./dishGroups"
import type { NormalizedOption } from "./modifiers"

const opt = (name: string, extra: Partial<NormalizedOption> = {}, position = 0): NormalizedOption => ({
  name, priceDeltaMinor: 0, isAvailable: true, position, ...extra,
})
const live = (id: string, name: string): StoredOption => ({ id, name, deletedAt: null })
const dead = (id: string, name: string): StoredOption => ({ id, name, deletedAt: new Date("2026-01-01") })

const group = (over: Record<string, unknown> = {}) => ({
  name: "Size", minSelect: 1, maxSelect: 1,
  options: [{ name: "Small" }, { name: "Large", priceDeltaMinor: 200 }],
  ...over,
})

describe("normalizeDishGroups", () => {
  it("accepts a dish's groups in order, each validated like any group", () => {
    const groups = normalizeDishGroups([group(), group({ name: "Sauces", minSelect: 0, maxSelect: 2 })])
    expect(groups.map((g) => g.name)).toEqual(["Size", "Sauces"])
    expect(groups[0]!.options.map((o) => [o.name, o.priceDeltaMinor, o.position])).toEqual([["Small", 0, 0], ["Large", 200, 1]])
  })

  it("keeps an existing group's id so the save edits it in place", () => {
    expect(normalizeDishGroups([group({ id: "g-1" })])[0]!.id).toBe("g-1")
  })

  it("treats null as no groups", () => {
    expect(normalizeDishGroups(null)).toEqual([])
  })

  // Two dishes may each have a "Size"; ONE dish may not have two.
  it("refuses two groups with the same name on one dish", () => {
    expect(() => normalizeDishGroups([group(), group({ name: "size" })]))
      .toThrow(expect.objectContaining({ code: "DUPLICATE_GROUP_NAME" }))
  })

  it("refuses the same group id twice", () => {
    expect(() => normalizeDishGroups([group({ id: "g" }), group({ id: "g", name: "Other" })]))
      .toThrow(expect.objectContaining({ code: "INVALID_FIELD" }))
  })

  it("applies the selection rule per group", () => {
    expect(() => normalizeDishGroups([group({ minSelect: 3, maxSelect: 3 })]))
      .toThrow(expect.objectContaining({ code: "INVALID_RULE" }))
  })

  it("refuses something that is not a list", () => {
    expect(() => normalizeDishGroups({})).toThrow(expect.objectContaining({ code: "INVALID_FIELD" }))
  })

  it("caps the number of groups", () => {
    const many = Array.from({ length: 11 }, (_, i) => group({ name: `G${i}` }))
    expect(() => normalizeDishGroups(many)).toThrow(expect.objectContaining({ code: "TOO_MANY_GROUPS" }))
  })
})

describe("planOptionWrites", () => {
  it("updates kept options by id, creates new ones, soft-deletes the rest", () => {
    const plan = planOptionWrites(
      [live("a", "Small"), live("b", "Large")],
      [opt("Small", { id: "a", priceDeltaMinor: 50 }), opt("Medium", {}, 1)],
    )
    expect(plan.updates).toEqual([{ id: "a", option: expect.objectContaining({ name: "Small", priceDeltaMinor: 50 }) }])
    expect(plan.creates.map((o) => o.name)).toEqual(["Medium"])
    expect(plan.removals).toEqual([{ id: "b", name: "Large" }])
    expect(plan.renamed).toEqual([])
  })

  // The P2002 the old loop hit: the deleted "Large" still held the name.
  it("brings back a removed option re-added by name, keeping its id", () => {
    const plan = planOptionWrites([live("a", "Small"), dead("b", "Large")], [opt("Small", { id: "a" }), opt("Large")])
    expect(plan.creates).toEqual([])
    expect(plan.updates.map((u) => u.id)).toEqual(["a", "b"])
  })

  // The other P2002: a swap collides with the row not yet updated.
  it("routes a name swap through placeholder names", () => {
    const plan = planOptionWrites(
      [live("a", "Small"), live("b", "Large")],
      [opt("Large", { id: "a" }), opt("Small", { id: "b" })],
    )
    expect(plan.renamed.sort()).toEqual(["a", "b"])
  })

  it("moves a deleted row aside when a live option is renamed to its name", () => {
    const plan = planOptionWrites([live("a", "Regular"), dead("dead-row-1", "Large")], [opt("Large", { id: "a" })])
    expect(plan.asides).toEqual([{ id: "dead-row-1", name: asideName("Large", "dead-row-1") }])
    expect(plan.renamed.sort()).toEqual(["a", "dead-row-1"])
  })

  it("gives a removed option an aside name when a NEW option takes its name", () => {
    // "Large" (a) is removed by id while a brand-new "Large" is created.
    const plan = planOptionWrites([live("a", "Large")], [opt("Large", { id: undefined })].map((o) => ({ ...o })))
    // With no id, the new "Large" is not the stored one — it is created, and
    // the stored row is removed under a name that cannot collide.
    expect(plan.creates.map((o) => o.name)).toEqual(["Large"])
    expect(plan.removals).toEqual([{ id: "a", name: asideName("Large", "a") }])
    expect(plan.renamed).toEqual(["a"])
  })

  // The isolation guarantee: an option id from ANOTHER group is never editable here.
  it("refuses an option id that is not one of this group's", () => {
    expect(() => planOptionWrites([live("a", "Small")], [opt("Small", { id: "someone-elses" })]))
      .toThrow(expect.objectContaining({ code: "OPTION_NOT_FOUND" }))
  })

  it("leaves untouched names out of the placeholder pass", () => {
    const plan = planOptionWrites([live("a", "Small")], [opt("Small", { id: "a", priceDeltaMinor: 10 })])
    expect(plan.renamed).toEqual([])
  })
})

describe("groupTextChanged", () => {
  const before = { name: "Size", description: null, optionNames: ["Small", "Large"] }

  it("ignores price and order changes", () => {
    expect(groupTextChanged(before, { name: "Size", description: null, options: [opt("Large"), opt("Small", { priceDeltaMinor: 9 })] })).toBe(false)
  })

  it("sees a renamed option, an added one, and a renamed group", () => {
    expect(groupTextChanged(before, { name: "Size", description: null, options: [opt("Small"), opt("Huge")] })).toBe(true)
    expect(groupTextChanged(before, { name: "Size", description: null, options: [opt("Small"), opt("Large"), opt("Huge")] })).toBe(true)
    expect(groupTextChanged(before, { name: "Sizes", description: null, options: [opt("Small"), opt("Large")] })).toBe(true)
  })
})

describe("groupContentKey", () => {
  const base = { name: "Sauces", description: "Pick one", options: [{ name: "Hot" }, { name: "Mild" }] }

  it("matches the same words regardless of case, spacing and choice order", () => {
    expect(groupContentKey({ name: " sauces ", description: "pick  one", options: [{ name: "MILD" }, { name: "hot" }] }))
      .toBe(groupContentKey(base))
  })

  it("differs as soon as any screened word changes", () => {
    expect(groupContentKey({ ...base, name: "Sauce" })).not.toBe(groupContentKey(base))
    expect(groupContentKey({ ...base, description: null })).not.toBe(groupContentKey(base))
    expect(groupContentKey({ ...base, options: [{ name: "Hot" }, { name: "Medium" }] })).not.toBe(groupContentKey(base))
  })
})
