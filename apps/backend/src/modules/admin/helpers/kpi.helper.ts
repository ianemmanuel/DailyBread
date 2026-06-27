import type { KPITrend } from "@/types/kpi.types"

/**
 * Returns the start of the current calendar month (UTC midnight).
 * All trend comparisons use month boundaries so the label
 * "vs last month" is always accurate.
 */
export function currentMonthStart(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

/**
 * Returns the start of the previous calendar month (UTC midnight).
 */
export function previousMonthStart(): Date {
    const now = new Date()
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
}

/**
 * Derives a KPITrend from two snapshot counts.
 *
 * @param current  — the value right now
 * @param previous — the value at the start of this month
 *                   (i.e. records created before this month = last month's total)
 *
 * delta        = current − previous
 * deltaPercent = delta / previous × 100  (0 when previous = 0)
 * direction    = "up" | "down" | "flat"
 */
export function buildTrend(current: number, previous: number): KPITrend {
    const delta = current - previous
    const deltaPercent =
        previous === 0
        ? delta > 0 ? 100 : 0
        : Math.round((delta / previous) * 1000) / 10   // one decimal place

    const direction: KPITrend["direction"] =
        delta > 0 ? "up" : delta < 0 ? "down" : "flat"

    return { delta, deltaPercent, direction }
}