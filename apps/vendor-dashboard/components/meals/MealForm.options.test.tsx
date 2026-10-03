// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"

/*
 * The meal form's option groups, through the REAL MealForm and option sheet.
 *
 * Regression for the reported defect: finishing an option group submitted the
 * whole meal. The sheet is portalled in the DOM but was a child of the meal's
 * <form> in the React tree, and React bubbles synthetic submit events along
 * the React tree — so "Create option group" (or Enter in a choice) also ran
 * the meal's submit, saving the meal before the new group was even on it.
 *
 * Also pins the payload the meal save sends: the dish's own groups, in order,
 * with signed price deltas and no ids on anything new.
 */

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const push = vi.fn()
const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const createMeal = vi.fn(async (body: unknown) => ({ id: "new-meal", body }))
const KES = { code: "KES", symbol: "KSh", minorUnitDigits: 2 }

vi.mock("@/lib/queries/menu", () => ({
  useMenuContext: () => ({
    isLoading: false,
    data: {
      currency: KES,
      tax: { pricesIncludeTax: true, label: "VAT", standardRateBps: null, categories: [] },
      outlets: [{ id: "outlet-1", name: "Main", addressLine1: "1 Road", isMainOutlet: true }],
      sections: [], cuisines: [], dietaryTags: [],
      maxImages: 5, maxCuisines: 3, maxDietaryTags: 5,
    },
  }),
  useCreateMenuItem   : () => ({ mutateAsync: createMeal, isPending: false }),
  useUpdateMenuItem   : () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateMenuSection: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useModifierGroups   : () => ({
    data: [{
      id: "other-group", name: "Drinks", description: null, minSelect: 0, maxSelect: 1, required: false,
      reviewStatus: "AUTO_APPROVED", flagReasons: [], rejectionReason: null, createdAt: "", updatedAt: "",
      dish: { id: "other-meal", name: "Chicken Wrap" },
      options: [{ id: "other-opt", name: "Soda", priceDeltaMinor: 15000, isAvailable: true, position: 0 }],
    }],
  }),
}))

import { MealForm } from "./MealForm"

let root: Root
let host: HTMLDivElement

beforeEach(() => {
  createMeal.mockClear(); push.mockClear()
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  document.body.innerHTML = ""
})

/** Type into a controlled input the way a browser does. */
function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!
  act(() => {
    setter.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
}
const byPlaceholder = (text: string) => document.querySelector<HTMLInputElement>(`input[placeholder="${text}"]`)!
const button = (label: string) =>
  [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === label) as HTMLButtonElement
const click = (el: HTMLElement) => act(() => { el.click() })

async function renderForm() {
  await act(async () => { root.render(<MealForm />) })
}

async function buildSizeGroup() {
  click(button("Add group"))
  type(byPlaceholder("Size, Choose a side, Extra toppings"), "Size")
  type(byPlaceholder("e.g. Regular"), "Regular")
  type(byPlaceholder("e.g. Large"), "Large")
  // Second choice: an EXTRA charge, entered as a positive amount.
  const extras = [...document.querySelectorAll("button")].filter((b) => b.textContent === "Extra charge")
  click(extras[1] as HTMLButtonElement)
  type(document.querySelector<HTMLInputElement>('input[aria-label^="Extra charge for Large"]')!, "50")
}

describe("MealForm option groups", () => {
  it("finishing a group does NOT submit the meal — the group lands on the draft for review", async () => {
    await renderForm()
    type(byPlaceholder("Chicken Biryani"), "Plate")
    type(byPlaceholder("1250.00"), "1000")
    await buildSizeGroup()

    // The submit button inside the portalled sheet.
    await act(async () => { button("Add to meal").click() })

    expect(createMeal).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
    // Read back on the meal, with its price effect in words.
    expect(document.body.textContent).toContain("Optional · up to 1")
    expect(document.body.textContent).toMatch(/\+.*50\.00 extra/)
    expect(document.body.textContent).toContain("They're saved when you save the meal")
  })

  it("Enter inside the sheet does not submit the meal either", async () => {
    await renderForm()
    type(byPlaceholder("Chicken Biryani"), "Plate")
    type(byPlaceholder("1250.00"), "1000")
    await buildSizeGroup()
    const sheetForm = byPlaceholder("e.g. Regular").closest("form")!
    await act(async () => { sheetForm.requestSubmit() })
    expect(createMeal).not.toHaveBeenCalled()
  })

  it("the meal's own Save sends the groups: in order, signed deltas, no ids on new or copied content", async () => {
    await renderForm()
    type(byPlaceholder("Chicken Biryani"), "Plate")
    type(byPlaceholder("1250.00"), "1000")
    await buildSizeGroup()
    await act(async () => { button("Add to meal").click() })

    await act(async () => { button("Add to menu").click() })

    expect(createMeal).toHaveBeenCalledTimes(1)
    const body = createMeal.mock.calls[0]![0] as { modifierGroups: unknown; modifierGroupIds?: unknown }
    expect(body).not.toHaveProperty("modifierGroupIds")
    expect(body.modifierGroups).toEqual([{
      name: "Size", description: null, minSelect: 0, maxSelect: 1,
      options: [
        { name: "Regular", priceDeltaMinor: 0,    isAvailable: true },
        { name: "Large",   priceDeltaMinor: 5000, isAvailable: true },
      ],
    }])
    expect(push).toHaveBeenCalledWith("/meals/new-meal")
  })
})
