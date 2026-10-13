import type { SetupLane } from "@/types"

export const LANE_COPY: Record<SetupLane, { tab: string; chip: string; blurb: string }> = {
  department: {
    tab  : "Your department",
    chip : "Your department",
    blurb: "New colleagues in your role and scope, waiting for their first permissions. You can grant the permissions you hold.",
  },
  recovery: {
    tab  : "Other departments",
    chip : "Other department",
    blurb: "Accounts in other departments you can set up. Flagged when nobody in their own department can.",
  },
  oversight: {
    tab  : "Within your reach",
    chip : "Within your reach",
    blurb: "You can assign these, but leads closer to them are expected to.",
  },
}

export const LANES = Object.keys(LANE_COPY) as SetupLane[]

export function parseLane(value: string | undefined): SetupLane | "all" {
  return value && (LANES as string[]).includes(value) ? (value as SetupLane) : "all"
}
