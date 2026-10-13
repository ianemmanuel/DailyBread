import type { ReactNode } from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let host: HTMLDivElement | null = null

export function render(ui: ReactNode): HTMLDivElement {
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root!.render(ui))
  return host
}

export function cleanup(): void {
  if (root) act(() => root!.unmount())
  host?.remove()
  document.body.innerHTML = ""
  root = null
  host = null
}

/** Searches the whole document: Radix dialogs render in a portal outside the host. */
export function byText(text: string, selector = "*"): HTMLElement | null {
  const matches = [...document.body.querySelectorAll<HTMLElement>(selector)]
    .filter((el) => el.textContent?.trim() === text)
  return matches.at(-1) ?? null
}

export function button(name: string): HTMLButtonElement | null {
  return [...document.body.querySelectorAll<HTMLButtonElement>("button")]
    .find((b) => b.textContent?.trim() === name || b.getAttribute("aria-label") === name) ?? null
}

export async function click(el: Element | null): Promise<void> {
  if (!el) throw new Error("click: element not found")
  await act(async () => { (el as HTMLElement).click() })
}

export async function type(el: Element | null, value: string): Promise<void> {
  if (!el) throw new Error("type: element not found")
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value)
    el.dispatchEvent(new Event("input", { bubbles: true }))
  })
}

export async function keydown(el: Element | null, key: string): Promise<void> {
  if (!el) throw new Error("keydown: element not found")
  await act(async () => { el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })) })
}

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}
