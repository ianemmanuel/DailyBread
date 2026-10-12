import { describe, it, expect } from "vitest"
import { AdminPermissions, MEAL_REASON_ACTIONS, MealReasonActions } from "@repo/types/enums"
import {
  KNOWN_REASON_ACTIONS,
  REASON_ACTION_PERMISSIONS,
  assertCanConfigureReasonActions,
  assertCanUseReasonsFor,
  authorableReasonActions,
} from "./reason-actions"

function code(fn: () => unknown): string {
  try { fn(); return "NO_ERROR" } catch (e) { return (e as { code?: string }).code ?? String(e) }
}

const MOD = AdminPermissions.VENDORS_MEALS_MODERATE
const ENF = AdminPermissions.VENDORS_MEALS_ENFORCE

describe("REASON_ACTION_PERMISSIONS", () => {
  it("covers every meal reason action, and only real permission keys", () => {
    for (const a of MEAL_REASON_ACTIONS) expect(KNOWN_REASON_ACTIONS).toContain(a)
    const keys = new Set<string>(Object.values(AdminPermissions))
    for (const k of Object.values(REASON_ACTION_PERMISSIONS)) expect(keys.has(k)).toBe(true)
  })

  it("splits meal review from meal enforcement", () => {
    expect(REASON_ACTION_PERMISSIONS[MealReasonActions.DISH_SEND_BACK]).toBe(MOD)
    expect(REASON_ACTION_PERMISSIONS[MealReasonActions.GROUP_SEND_BACK]).toBe(MOD)
    expect(REASON_ACTION_PERMISSIONS[MealReasonActions.LISTING_HIDE]).toBe(MOD)
    expect(REASON_ACTION_PERMISSIONS[MealReasonActions.DISH_SUSPEND]).toBe(ENF)
    expect(REASON_ACTION_PERMISSIONS[MealReasonActions.DISH_BAN]).toBe(ENF)
    expect(REASON_ACTION_PERMISSIONS[MealReasonActions.LISTING_SUSPEND]).toBe(ENF)
  })

  it("names exactly the actions found in the code and the seeded reasons", () => {
    expect([...KNOWN_REASON_ACTIONS].sort()).toEqual([
      "admin_user.deactivated", "admin_user.suspended", "customer.refund", "customer.suspended",
      "meal.hidden", "meal.suspended", "menu_item.banned", "menu_item.sent_back", "menu_item.suspended",
      "modifier_group.sent_back", "outlet.suspended", "vendor_account.banned", "vendor_account.suspended",
      "vendor_application.needs_revision", "vendor_application.rejected",
    ])
  })
})

describe("assertCanConfigureReasonActions", () => {
  it("allows an author who governs every action", () => {
    expect(code(() => assertCanConfigureReasonActions([MOD, ENF], [MealReasonActions.LISTING_HIDE, MealReasonActions.DISH_BAN]))).toBe("NO_ERROR")
  })
  it("refuses an action the author does not govern — including a review author on an enforcement action", () => {
    expect(code(() => assertCanConfigureReasonActions([MOD], [MealReasonActions.DISH_BAN]))).toBe("REASON_ACTION_FORBIDDEN")
    expect(code(() => assertCanConfigureReasonActions([MOD, ENF], ["customer.suspended"]))).toBe("REASON_ACTION_FORBIDDEN")
    expect(code(() => assertCanConfigureReasonActions([MOD, ENF], ["admin_user.deactivated"]))).toBe("REASON_ACTION_FORBIDDEN")
    expect(code(() => assertCanConfigureReasonActions([AdminPermissions.CUSTOMERS_ACCOUNTS_SUSPEND], ["customer.suspended"]))).toBe("NO_ERROR")
  })
  it("refuses unknown names before anything else — free text is never stored", () => {
    expect(code(() => assertCanConfigureReasonActions([MOD, ENF], ["meal.hidden", "meal.vapourised"]))).toBe("UNKNOWN_REASON_ACTION")
    expect(code(() => assertCanConfigureReasonActions([MOD], ["__proto__"]))).toBe("UNKNOWN_REASON_ACTION")
  })
})

describe("authorableReasonActions", () => {
  it("is the governed subset", () => {
    expect(authorableReasonActions([MOD], MEAL_REASON_ACTIONS).sort())
      .toEqual([MealReasonActions.DISH_SEND_BACK, MealReasonActions.GROUP_SEND_BACK, MealReasonActions.LISTING_HIDE].sort())
    expect(authorableReasonActions([ENF], MEAL_REASON_ACTIONS).sort())
      .toEqual([MealReasonActions.DISH_BAN, MealReasonActions.DISH_SUSPEND, MealReasonActions.LISTING_SUSPEND].sort())
    expect(authorableReasonActions([], MEAL_REASON_ACTIONS)).toEqual([])
  })
})

describe("assertCanUseReasonsFor", () => {
  it("offers a picker only to an admin who governs that action", () => {
    expect(code(() => assertCanUseReasonsFor([MOD], MealReasonActions.LISTING_HIDE))).toBe("NO_ERROR")
    expect(code(() => assertCanUseReasonsFor([MOD], MealReasonActions.DISH_BAN))).toBe("FORBIDDEN")
    expect(code(() => assertCanUseReasonsFor([ENF], MealReasonActions.DISH_BAN))).toBe("NO_ERROR")
    expect(code(() => assertCanUseReasonsFor([MOD, ENF], "nope"))).toBe("INVALID_ACTION")
  })
})
