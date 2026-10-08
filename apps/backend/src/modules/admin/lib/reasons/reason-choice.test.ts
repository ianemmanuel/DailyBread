import { describe, it, expect } from "vitest"
import type { AdminScopeContext } from "@repo/types/backend"
import { MealReasonActions as A, OTHER_REASON_CODE } from "@repo/types/enums"
import { ApiError } from "@/middleware/error"
import {
  chooseReason, canUseOtherReason, reasonAuditMetadata, readAuditReason, reasonCodeFromLabel, firstFreeReasonCode,
  type ReasonRow,
} from "./reason-choice"

const GLOBAL : AdminScopeContext = { isGlobal: true,  countryIds: [], cityIds: [], tier: "GLOBAL" }
const COUNTRY: AdminScopeContext = { isGlobal: false, countryIds: ["ke"], cityIds: [], tier: "COUNTRY" }
const CITY   : AdminScopeContext = { isGlobal: false, countryIds: ["ke"], cityIds: ["nbo"], tier: "CITY" }

const ALLERGEN: ReasonRow = {
  id: "r1", code: "INCORRECT_ALLERGENS", label: "Incorrect allergen information",
  description: "The allergen information for this dish appears to be inaccurate or incomplete.",
  appliesTo: [A.DISH_SEND_BACK, A.LISTING_HIDE, A.LISTING_SUSPEND], isActive: true,
}

function code(fn: () => unknown): string | undefined {
  try { fn(); return undefined } catch (e) { return e instanceof ApiError ? e.code : "NOT_API_ERROR" }
}
const pick = (over: Record<string, unknown> = {}) => ({ code: ALLERGEN.code, vendorMessage: undefined, internalNote: undefined, ...over })

describe("chooseReason — predefined reasons", () => {
  it("a selected reason supplies its own vendor explanation", () => {
    expect(chooseReason(pick(), A.LISTING_HIDE, CITY, ALLERGEN)).toEqual({
      reasonId: "r1", code: "INCORRECT_ALLERGENS", label: "Incorrect allergen information",
      vendorMessage: ALLERGEN.description, isOther: false, internalNote: null,
    })
  })
  it("the internal note is optional and kept separate", () => {
    expect(chooseReason(pick({ internalNote: "  seen on two outlets  " }), A.LISTING_HIDE, CITY, ALLERGEN).internalNote)
      .toBe("seen on two outlets")
  })
  it("no reason is refused", () => {
    expect(code(() => chooseReason(pick({ code: undefined }), A.LISTING_HIDE, CITY, null))).toBe("REASON_REQUIRED")
    expect(code(() => chooseReason(pick({ code: "  " }), A.LISTING_HIDE, CITY, null))).toBe("REASON_REQUIRED")
  })
  it("an unknown or inactive reason is refused", () => {
    expect(code(() => chooseReason(pick(), A.LISTING_HIDE, CITY, null))).toBe("INVALID_REASON_CODE")
    expect(code(() => chooseReason(pick(), A.LISTING_HIDE, CITY, { ...ALLERGEN, isActive: false }))).toBe("INVALID_REASON_CODE")
  })
  it("a reason that does not apply to this action is refused", () => {
    expect(code(() => chooseReason(pick(), A.DISH_BAN, COUNTRY, ALLERGEN))).toBe("REASON_NOT_APPLICABLE")
  })
  it("a predefined reason cannot carry the admin's own vendor text", () => {
    expect(code(() => chooseReason(pick({ vendorMessage: "my own words" }), A.LISTING_HIDE, COUNTRY, ALLERGEN)))
      .toBe("VENDOR_MESSAGE_ONLY_FOR_OTHER")
  })
  it("a reason with no explanation configured cannot justify an action", () => {
    expect(code(() => chooseReason(pick(), A.LISTING_HIDE, COUNTRY, { ...ALLERGEN, description: "  " })))
      .toBe("REASON_HAS_NO_EXPLANATION")
  })
})

describe("chooseReason — Other, the controlled exception", () => {
  const other = (vendorMessage: unknown) => ({ code: OTHER_REASON_CODE, vendorMessage, internalNote: undefined })
  const text = "The photo shows a different dish from the one described."

  it("a CITY admin cannot use Other", () => {
    expect(canUseOtherReason(CITY)).toBe(false)
    expect(code(() => chooseReason(other(text), A.LISTING_HIDE, CITY, null))).toBe("OTHER_REASON_NOT_ALLOWED")
  })
  it("COUNTRY and GLOBAL may, with their own explanation", () => {
    expect(canUseOtherReason(COUNTRY)).toBe(true)
    expect(canUseOtherReason(GLOBAL)).toBe(true)
    const snap = chooseReason(other(text), A.LISTING_SUSPEND, COUNTRY, null)
    expect(snap).toMatchObject({ reasonId: null, code: "OTHER", label: "Other", vendorMessage: text, isOther: true })
    expect(chooseReason(other(text), A.DISH_BAN, GLOBAL, null).isOther).toBe(true)
  })
  it("Other with an empty or token explanation is refused", () => {
    expect(code(() => chooseReason(other(undefined), A.LISTING_HIDE, COUNTRY, null))).toBe("OTHER_NEEDS_EXPLANATION")
    expect(code(() => chooseReason(other("   "), A.LISTING_HIDE, COUNTRY, null))).toBe("OTHER_NEEDS_EXPLANATION")
    expect(code(() => chooseReason(other("bad"), A.LISTING_HIDE, GLOBAL, null))).toBe("OTHER_NEEDS_EXPLANATION")
  })
  it("non-text input is refused, not coerced", () => {
    expect(code(() => chooseReason(other(42), A.LISTING_HIDE, COUNTRY, null))).toBe("INVALID_REASON_INPUT")
  })
})

describe("audit snapshots", () => {
  it("are structured, and the internal note sits beside the reason", () => {
    const meta = reasonAuditMetadata(chooseReason(pick({ internalNote: "n" }), A.LISTING_HIDE, CITY, ALLERGEN))
    expect(meta).toEqual({
      reason: { reasonId: "r1", code: "INCORRECT_ALLERGENS", label: ALLERGEN.label, vendorMessage: ALLERGEN.description, isOther: false },
      internalNote: "n",
    })
  })
  it("a snapshot does not change when the reason is later reworded", () => {
    const meta = reasonAuditMetadata(chooseReason(pick(), A.LISTING_HIDE, CITY, ALLERGEN))
    const reworded = { ...ALLERGEN, label: "Allergens", description: "Something else entirely now." }
    void reworded
    expect(readAuditReason(meta)).toMatchObject({ label: ALLERGEN.label, vendorMessage: ALLERGEN.description })
  })
  it("old free-text records read back as legacy text, never as an invented reason", () => {
    expect(readAuditReason({ reason: "Customer complaint" }))
      .toEqual({ code: null, label: null, vendorMessage: null, isOther: false, internalNote: null, legacyText: "Customer complaint" })
    expect(readAuditReason(null).legacyText).toBeNull()
  })
})


describe("system-generated reason codes", () => {
  it("derives an upper-snake code from the name", () => {
    expect(reasonCodeFromLabel("Image does not represent the meal")).toBe("IMAGE_DOES_NOT_REPRESENT_THE_MEAL")
    expect(reasonCodeFromLabel("  Allergens — missing / wrong!  ")).toBe("ALLERGENS_MISSING_WRONG")
    expect(reasonCodeFromLabel("Café crème")).toBe("CAFE_CREME")
    expect(reasonCodeFromLabel("!!!")).toBe("REASON")
  })
  it("caps the length without a trailing underscore", () => {
    const code = reasonCodeFromLabel("word ".repeat(40))
    expect(code.length).toBeLessThanOrEqual(60)
    expect(code.endsWith("_")).toBe(false)
  })
  it("resolves collisions by suffixing, and never yields OTHER", () => {
    expect(firstFreeReasonCode("PRICING", new Set())).toBe("PRICING")
    expect(firstFreeReasonCode("PRICING", new Set(["PRICING", "PRICING_2"]))).toBe("PRICING_3")
    expect(firstFreeReasonCode("OTHER", new Set())).toBe("OTHER_2")
    const long = "A".repeat(60)
    const next = firstFreeReasonCode(long, new Set([long]))
    expect(next.length).toBeLessThanOrEqual(60)
    expect(next.endsWith("_2")).toBe(true)
  })
})
