"use client"

import { useState } from "react"
import { Loader2, Lock, RotateCcw, Save } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useSaveRequest } from "./useSaveRequest"
import { SaveError } from "./SaveError"

export interface ProfileValues {
  firstName : string
  middleName: string
  lastName  : string
  employeeId: string
}

interface Props {
  userId   : string
  email    : string
  initial  : ProfileValues
  /** The account version this form was loaded from. */
  updatedAt: string
}

const FIELDS: Array<{ name: keyof ProfileValues; label: string; required?: boolean; placeholder?: string }> = [
  { name: "firstName", label: "First name", required: true },
  { name: "middleName", label: "Middle name", placeholder: "Optional" },
  { name: "lastName", label: "Last name", required: true },
]

export function ProfileForm({ userId, email, initial, updatedAt }: Props) {
  const [values, setValues] = useState<ProfileValues>(initial)
  const { save, pending, error, stale, reload } = useSaveRequest(`/api/identity/users/${encodeURIComponent(userId)}/profile`, "PATCH")

  const set = (name: keyof ProfileValues) => (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [name]: e.target.value }))
  const dirty   = (Object.keys(initial) as Array<keyof ProfileValues>).some((k) => values[k].trim() !== initial[k].trim())
  // A preview only — the backend validates every field again.
  const missing = !values.firstName.trim() || !values.lastName.trim()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!dirty || missing) return
    void save({ ...values, expectedUpdatedAt: updatedAt }, "Profile saved")
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div className="grid gap-4 sm:grid-cols-3">
        {FIELDS.map((f) => (
          <div key={f.name} className="space-y-1.5">
            <Label htmlFor={f.name}>{f.label}{f.required && <span aria-hidden className="text-destructive"> *</span>}</Label>
            <Input
              id={f.name}
              value={values[f.name]}
              onChange={set(f.name)}
              placeholder={f.placeholder}
              required={f.required}
              aria-invalid={f.required && !values[f.name].trim() ? true : undefined}
              maxLength={100}
            />
          </div>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="email" className="flex items-center gap-1.5">Work email <Lock aria-hidden className="h-3 w-3 text-muted-foreground" /></Label>
          <Input id="email" value={email} readOnly disabled aria-describedby="email-help" />
          <p id="email-help" className="text-xs text-muted-foreground">
            The email can&apos;t be changed. If it&apos;s wrong, deactivate this account and create a new one.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="employeeId">Employee ID <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <Input id="employeeId" value={values.employeeId} onChange={set("employeeId")} placeholder="EMP-0042" className="font-mono" maxLength={50} />
        </div>
      </div>

      {missing && <p className="text-sm text-destructive">First and last name are required.</p>}
      <SaveError error={error} stale={stale} onReload={reload} />

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/60 pt-4">
        {dirty && (
          <Button type="button" variant="neutral" className="group" disabled={pending} onClick={() => setValues(initial)}>
            <RotateCcw className="transition-transform duration-300 group-hover:-rotate-180" />
            Discard changes
          </Button>
        )}
        <Button type="submit" size="lg" className="group px-4 shadow-sm hover:-translate-y-px hover:bg-primary/90 hover:shadow-md" disabled={pending || !dirty || missing}>
          {pending ? <Loader2 className="animate-spin" /> : <Save className="transition-transform duration-200 group-hover:scale-110" />}
          Save profile
        </Button>
      </div>
    </form>
  )
}
