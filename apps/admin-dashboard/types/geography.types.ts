
import { ServiceAreaMode } from "@repo/types/admin-app"

//* Service area mode UI config

export const SERVICE_AREA_MODE_CONFIG: Record<
  ServiceAreaMode,
  { label: string; color: string; fillColor: string; description: string }
> = {
  FULL_SERVICE : {
    label      : "Full Service",
    color      : "#22c55e",
    fillColor  : "rgba(34, 197, 94, 0.15)",
    description: "Platform dispatches couriers — full service",
  },
  SELF_DELIVERY: {
    label      : "Self Delivery",
    color      : "#3b82f6",
    fillColor  : "rgba(59, 130, 246, 0.15)",
    description: "Vendor receives orders, handles own delivery",
  },
  WAITLIST     : {
    label      : "Waitlist",
    color      : "#f59e0b",
    fillColor  : "rgba(245, 158, 11, 0.15)",
    description: "Pre-onboarding allowed, not yet live",
  },
  EXCLUDED     : {
    label      : "Excluded",
    color      : "#ef4444",
    fillColor  : "rgba(239, 68, 68, 0.15)",
    description: "Not serviceable — never shown to vendors or customers",
  },
}