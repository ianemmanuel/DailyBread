// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest"
import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { MoneyInput } from "./MoneyInput"

/*
 * Regression for "Where it's sold": the currency symbol was ABSOLUTELY
 * positioned over the input with a fixed left padding, so a wide symbol
 * ("KSh") overlapped the amount. jsdom cannot measure layout, so this pins
 * the structure that makes overlap impossible instead: the symbol is an
 * in-flow flex item beside the input, and nothing reserves space for it with
 * padding.
 */

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const KES = { code: "KES", symbol: "KSh", minorUnitDigits: 2 }
const UGX = { code: "UGX", symbol: "USh", minorUnitDigits: 0 }
const KWD = { code: "KWD", symbol: "د.ك", minorUnitDigits: 3 }

let root: Root
let host: HTMLDivElement
function render(node: React.ReactNode) {
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root.render(node))
  const wrapper = host.querySelector<HTMLElement>('[data-slot="money-input"]')!
  return { wrapper, prefix: wrapper.querySelector("span")!, input: wrapper.querySelector("input")! }
}
afterEach(() => { act(() => root.unmount()); host.remove() })

describe("MoneyInput", () => {
  it("puts the currency BESIDE the amount — an in-flow flex item, never an overlay", () => {
    const { wrapper, prefix, input } = render(<MoneyInput currency={KES} label="Price at Westlands" value="" onChange={() => {}} />)
    expect(wrapper.className).toMatch(/\bflex\b/)
    expect(prefix.textContent).toBe("KSh")
    expect(prefix.className).toMatch(/\bshrink-0\b/)
    expect(prefix.className).not.toMatch(/\babsolute\b/)
    // The input is the flexible sibling; it does not pad around an overlay.
    expect(input.className).toMatch(/\bflex-1\b/)
    expect(input.className).not.toMatch(/\bpl-\d/)
    expect(prefix.nextElementSibling).toBe(input)
  })

  it("names the field with the currency CODE for screen readers; the symbol is decorative", () => {
    const { prefix, input } = render(<MoneyInput currency={KES} label="Price at Westlands" value="" onChange={() => {}} />)
    expect(input.getAttribute("aria-label")).toBe("Price at Westlands, in KES")
    expect(prefix.getAttribute("aria-hidden")).toBe("true")
  })

  it("never assumes two decimals: zero- and three-digit currencies get their own placeholder", () => {
    expect(render(<MoneyInput currency={UGX} label="Price" value="" onChange={() => {}} />).input.placeholder).toBe("0")
    act(() => root.unmount()); host.remove()
    expect(render(<MoneyInput currency={KWD} label="Price" value="" onChange={() => {}} />).input.placeholder).toBe("0.000")
  })

  it("shows a sign before the symbol for a price change", () => {
    const { prefix } = render(<MoneyInput currency={KES} sign="+" label="Extra" value="" onChange={() => {}} />)
    expect(prefix.textContent).toBe("+KSh")
  })
})
