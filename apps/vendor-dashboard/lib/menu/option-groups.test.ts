import { describe, it, expect } from "vitest"
import {
  draftFromAttached, draftCopyOf, toDishGroupPayload, ruleLabel, describeDelta, splitDelta, joinDelta,
  draftGroupProblem, type DraftGroup,
} from "./option-groups"
import type { AttachedModifierGroup } from "@/lib/queries/menu"

const KES = { code: "KES", symbol: "KSh", minorUnitDigits: 2 }
const UGX = { code: "UGX", symbol: "USh", minorUnitDigits: 0 }

const attached: AttachedModifierGroup = {
  id: "g-1", name: "Size", description: "Pick one", minSelect: 1, maxSelect: 1, required: true,
  flagged: false, reviewStatus: "MANUALLY_REJECTED", rejectionReason: "Rename it", position: 0,
  options: [
    { id: "o-1", name: "Small", priceDeltaMinor: 0, isAvailable: true },
    { id: "o-2", name: "Large", priceDeltaMinor: 5000, isAvailable: false },
  ],
}

describe("the meal form's modifierGroups payload", () => {
  it("edits one of this dish's groups in place: ids kept, display-only fields never sent", () => {
    const [payload] = toDishGroupPayload([draftFromAttached(attached)])
    expect(payload).toEqual({
      id: "g-1", name: "Size", description: "Pick one", minSelect: 1, maxSelect: 1,
      options: [
        { id: "o-1", name: "Small", priceDeltaMinor: 0, isAvailable: true },
        { id: "o-2", name: "Large", priceDeltaMinor: 5000, isAvailable: false },
      ],
    })
  })

  // The independence guarantee, on the client side: a copy is content only.
  it("a COPY carries the content and none of the source's ids", () => {
    const copy = draftCopyOf({ ...attached, required: true, flagReasons: [], dish: null, createdAt: "", updatedAt: "",
      options: attached.options.map((o, i) => ({ ...o, position: i })) } as never, "Chicken Wrap")
    const [payload] = toDishGroupPayload([copy])
    expect(payload).not.toHaveProperty("id")
    expect(payload!.options.every((o) => !("id" in o))).toBe(true)
    expect(payload!.options.map((o) => [o.name, o.priceDeltaMinor])).toEqual([["Small", 0], ["Large", 5000]])
    expect(copy.copiedFrom).toBe("Chicken Wrap")
  })

  it("trims text and sends a blank description as null", () => {
    const draft: DraftGroup = { key: "k", name: "  Sauces ", description: "  ", minSelect: 0, maxSelect: 2,
      options: [{ key: "a", name: " Hot ", priceDeltaMinor: 0, isAvailable: true }] }
    expect(toDishGroupPayload([draft])[0]).toMatchObject({ name: "Sauces", description: null, options: [{ name: "Hot" }] })
  })
})

describe("price adjustments in words", () => {
  it("names an extra charge, a discount and no adjustment, in the vendor's currency", () => {
    expect(describeDelta(5000, KES)).toMatch(/^\+.*50\.00 extra$/)
    expect(describeDelta(-2500, KES)).toMatch(/25\.00 less$/)
    expect(describeDelta(0, KES)).toBe("No extra charge")
    // Zero-decimal currency: never assume two digits.
    expect(describeDelta(500, UGX)).toMatch(/500 extra$/)
    expect(describeDelta(500, UGX)).not.toMatch(/500\.00/)
  })

  it("splits and re-joins a signed delta without a minus sign ever being typed", () => {
    expect(splitDelta(-2500, KES)).toEqual({ kind: "less", amount: "25.00" })
    expect(joinDelta("less", "25", KES)).toBe(-2500)
    expect(joinDelta("extra", "25.5", KES)).toBe(2550)
    expect(joinDelta("none", "99", KES)).toBe(0)
  })

  it("refuses an extra/less with no usable amount rather than saving zero", () => {
    expect(joinDelta("extra", "", KES)).toBeNull()
    expect(joinDelta("less", "0", KES)).toBeNull()
    expect(joinDelta("extra", "-5", KES)).toBeNull()
  })
})

describe("rule labels", () => {
  it("reads like a menu", () => {
    expect(ruleLabel(1, 1)).toBe("Required · pick 1")
    expect(ruleLabel(1, 3)).toBe("Required · pick 1–3")
    expect(ruleLabel(0, 1)).toBe("Optional · up to 1")
    expect(ruleLabel(0, 3)).toBe("Optional · up to 3")
  })
})

describe("draftGroupProblem (preview of the server's rules)", () => {
  const base = draftFromAttached({ ...attached, options: attached.options.map((o) => ({ ...o, isAvailable: true })) })

  it("passes a valid group", () => {
    expect(draftGroupProblem(base, [])).toBeNull()
  })
  it("catches a second group with the same name on this meal", () => {
    expect(draftGroupProblem(base, ["size"])).toMatch(/already has a group/)
  })
  it("catches a limit larger than the choices", () => {
    expect(draftGroupProblem({ ...base, maxSelect: 3 }, [])).toMatch(/can't pick 3 from 2/)
  })
  it("catches a required group whose choices are all sold out", () => {
    expect(draftGroupProblem({ ...base, options: base.options.map((o) => ({ ...o, isAvailable: false })) }, [])).toMatch(/sold out/)
  })
  it("catches duplicate choices", () => {
    expect(draftGroupProblem({ ...base, options: [...base.options, { key: "x", name: "small", priceDeltaMinor: 0, isAvailable: true }] }, []))
      .toMatch(/appears twice/)
  })
})
