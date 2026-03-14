'use client'

import Link from 'next/link'
import { Check } from 'lucide-react'
import { cn } from '@repo/ui/lib/utils'

interface Application {
  status: string
  documents?: Array<{ status: string }>
}

interface Props {
  application: Application | null
}

function getStep(application: Application | null): 1 | 2 | 3 {
  if (!application) return 1
  if (['SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'].includes(application.status)) return 3
  const hasDocuments = application.documents?.some((d) => d.status !== 'WITHDRAWN') ?? false
  return hasDocuments ? 3 : 2
}

const STEPS = [
  { label: 'Business Details', route: '/onboarding/business-details' },
  { label: 'Documents',        route: '/onboarding/documents'        },
  { label: 'Review & Submit',  route: '/onboarding/review'           },
]

export function OnboardingStepIndicator({ application }: Props) {
  const current = getStep(application)

  return (
    <nav aria-label="Onboarding progress" className="mb-8">
      <ol className="flex items-center">
        {STEPS.map(({ label, route }, i) => {
          const step = (i + 1) as 1 | 2 | 3
          const isCompleted = step < current
          const isActive    = step === current
          const isLast      = i === STEPS.length - 1

          const circle = (
            <div
              aria-current={isActive ? 'step' : undefined}
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                isCompleted && 'bg-primary text-primary-foreground',
                isActive    && 'border-2 border-primary bg-white text-primary',
                !isCompleted && !isActive && 'border-2 border-border bg-white text-muted-foreground'
              )}
            >
              {isCompleted ? <Check className="h-3.5 w-3.5" /> : step}
            </div>
          )

          return (
            <li key={label} className="flex flex-1 items-center">
              <div className="flex items-center gap-2.5">
                {isCompleted ? (
                  <Link href={route} className="flex items-center gap-2.5">
                    {circle}
                    <span className="hidden text-sm font-medium text-primary sm:block">{label}</span>
                  </Link>
                ) : (
                  <>
                    {circle}
                    <span className={cn(
                      'hidden text-sm font-medium sm:block',
                      isActive ? 'text-foreground' : 'text-muted-foreground'
                    )}>
                      {label}
                    </span>
                  </>
                )}
              </div>

              {/* Connector line between steps */}
              {!isLast && (
                <div className={cn(
                  'mx-3 h-px flex-1 transition-colors',
                  step < current ? 'bg-primary' : 'bg-border'
                )} />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}