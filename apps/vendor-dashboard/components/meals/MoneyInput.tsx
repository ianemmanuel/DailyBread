"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import type { MenuCurrency } from "@/lib/menu/money"

/*
 * An amount field with its currency shown BESIDE the number, never on top of
 * it.
 *
 * The previous fields drew the symbol absolutely positioned over the input
 * and reserved a fixed left padding for it. Symbols are not one width — "$",
 * "KSh", "USh", "د.ك" — so "KSh" ran into the typed amount in the narrow
 * "Price here" box. Here the prefix is a real flex item sized by its content:
 * the input takes whatever is left and the two can never overlap, at any
 * symbol length or viewport width.
 *
 * The visible prefix is decorative for a screen reader; the currency CODE is
 * part of the accessible name instead, which reads better than a symbol.
 */

interface Props extends Omit<React.ComponentProps<"input">, "prefix" | "size"> {
  currency: MenuCurrency
  /** Text before the symbol, e.g. "+" or "−" for a price change. */
  sign?   : string
  /** What the amount is, for the accessible name: "Price at Westlands". */
  label   : string
  size?   : "sm" | "md"
}

export function MoneyInput({ currency, sign, label, size = "md", className, placeholder, ...props }: Props) {
  return (
    <div
      data-slot="money-input"
      className={cn(
        "flex w-full min-w-0 items-center rounded-md border border-input bg-transparent shadow-xs transition-[color,box-shadow]",
        "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
        "has-[input[aria-invalid=true]]:border-destructive",
        size === "sm" ? "h-8" : "h-9",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "shrink-0 select-none whitespace-nowrap pl-2.5 pr-1.5 text-muted-foreground tabular-nums",
          size === "sm" ? "text-xs" : "text-sm",
        )}
      >
        {sign}{currency.symbol}
      </span>
      <input
        inputMode="decimal"
        aria-label={`${label}, in ${currency.code}`}
        placeholder={placeholder ?? (currency.minorUnitDigits === 0 ? "0" : `0.${"0".repeat(currency.minorUnitDigits)}`)}
        className={cn(
          "h-full w-full min-w-0 flex-1 bg-transparent pr-2.5 tabular-nums outline-none placeholder:text-muted-foreground",
          "disabled:cursor-not-allowed disabled:opacity-50",
          size === "sm" ? "text-sm" : "text-base md:text-sm",
        )}
        {...props}
      />
    </div>
  )
}
