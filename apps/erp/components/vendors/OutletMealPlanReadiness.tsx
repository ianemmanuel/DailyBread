import { CheckCircle2, CircleSlash } from "lucide-react"
import type { OutletMealPlanReadiness, OutletMealPlanBlocker } from "@/types"

/*
 * Admin-facing render of getOutletMealPlanReadiness — whether this outlet can
 * offer meal plans yet. Meal-plan ordering itself isn't built; this surfaces
 * the resolver so an admin can see where an outlet stands before that flow
 * exists. The inspection half is actionable from the panel just below.
 */

const BLOCKER_LABEL: Record<OutletMealPlanBlocker, string> = {
  NOT_CLEARED_TO_SERVE  : "Not cleared for on-demand serving yet",
  ZONE_LEVEL_TOO_LOW    : "Zone isn't at Full Operations (meal plans not allowed here)",
  ZONE_NOT_OPERATIONAL  : "Zone is paused, or the city is inactive",
  INSPECTION_REQUIRED   : "No premises inspection on record",
  INSPECTION_SCHEDULED  : "Premises inspection is scheduled but not yet done",
  INSPECTION_IN_PROGRESS: "Premises inspection is underway",
  INSPECTION_FAILED     : "Most recent premises inspection failed",
  INSPECTION_EXPIRED    : "Premises inspection passed but is past its re-inspection date",
}

const POLICY_LABEL: Record<string, string> = {
  NONE          : "Not required in this country",
  MEAL_PLAN_ONLY: "Required for meal plans",
  ALL           : "Required for all operations",
}

export function OutletMealPlanReadiness({ readiness }: { readiness: OutletMealPlanReadiness }) {
  return (
    <div className="admin-card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Meal-plan eligibility</h2>
        {readiness.eligible
          ? <span className="badge-success inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Eligible</span>
          : <span className="badge-warning inline-flex items-center gap-1"><CircleSlash className="h-3 w-3" /> Not eligible</span>}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3">
        <Row label="Inspection policy" value={POLICY_LABEL[readiness.policy] ?? readiness.policy} />
        <Row label="Zone allows meal plans" value={readiness.zoneAllowsMealPlans ? "Yes" : "No"} />
        <Row
          label="Inspection"
          value={readiness.inspectionRequired
            ? (readiness.inspectionStatus ? readiness.inspectionStatus.replace("_", " ").toLowerCase() : "none")
            : "not required"}
        />
      </dl>

      {readiness.blockers.length > 0 && (
        <ul className="space-y-1.5 border-t border-border pt-3">
          {readiness.blockers.map((b) => (
            <li key={b} className="flex items-start gap-2 text-xs">
              <CircleSlash className="mt-0.5 h-3 w-3 shrink-0 text-warning" />
              <span className="text-foreground">{BLOCKER_LABEL[b]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium capitalize text-foreground">{value}</dd>
    </div>
  )
}
