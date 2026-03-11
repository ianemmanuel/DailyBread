"use client"

import Link from "next/link"
import { Check } from "lucide-react"

interface Application {
  status: string
  documents?: Array<{ status: string }>
}

interface Props {
  application: Application | null
}

function getStep(application: Application | null): 1 | 2 | 3 {
  if (!application) return 1
  const status = application.status
  if (["SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED"].includes(status))
    return 3
  const hasDocuments =
    application.documents?.some(d => d.status !== "WITHDRAWN") ?? false
  return hasDocuments ? 3 : 2
}

const STEPS = ["Business Details", "Documents", "Review & Submit"]
const STEP_ROUTES = ["/onboarding", "/onboarding/documents", "/onboarding/review"]

export function OnboardingStepIndicator({ application }: Props) {
  const current = getStep(application)

  return (
    <div className="flex flex-col sm:flex-row items-center sm:justify-between gap-4 sm:gap-0">
      {STEPS.map((label, i) => {
        const step = (i + 1) as 1 | 2 | 3
        const isCompleted = step < current
        const isActive = step === current

        const stepContent = (
          <div className="flex items-center gap-3 flex-1 sm:flex-none w-full">
            <div
              className={`h-8 w-8 flex items-center justify-center rounded-full text-sm font-semibold transition-all ${
                isCompleted
                  ? "bg-foreground text-background"
                  : isActive
                  ? "border-2 border-foreground text-foreground"
                  : "border-2 border-border text-muted-foreground"
              }`}
            >
              {isCompleted ? <Check className="h-4 w-4" /> : step}
            </div>
            <span
              className={`text-sm font-medium ${
                isActive ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {label}
            </span>
          </div>
        )

        return (
          <div key={label} className="flex flex-1 items-center">
            {isCompleted ? (
              <Link href={STEP_ROUTES[i]} className="flex-1">
                {stepContent}
              </Link>
            ) : (
              stepContent
            )}

            {/* Connector line */}
            {i < STEPS.length - 1 && (
              <div
                className={`hidden sm:block flex-1 h-px mx-4 ${
                  step < current ? "bg-foreground" : "bg-border"
                }`}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}