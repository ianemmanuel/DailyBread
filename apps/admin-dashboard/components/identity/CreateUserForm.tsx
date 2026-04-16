"use client"

import { useRouter } from "next/navigation"
import { useForm } from "@tanstack/react-form"
import { toast } from "sonner"
import { Button } from "@repo/ui/components/button"
import { Input } from "@repo/ui/components/input"
import { Label } from "@repo/ui/components/label"
import { RoleCombobox } from "@/components/identity/RoleCombobox"
import { PermissionPicker } from "@/components/identity/PermissionPicker"
import { ScopeSelector } from "@/components/identity/ScopeSelector"
import {
  createAdminUserSchema,
  type CreateAdminUserFormValues,
} from "@/lib/validations/identity"
import { getFieldError }    from "@/lib/forms/form-helpers"
import type { AdminRole, AdminSessionData } from "@/types"

interface Props {
  roles  : AdminRole[]
  session: AdminSessionData
}

export function CreateUserForm({ roles, session }: Props) {
  const router  = useRouter()
  const isGlobalActor  = session.scope.isGlobal
  const actorCountries = session.scope.countryIds

  /**
   * useForm<CreateAdminUserFormValues> — explicit generic from z.output<schema>
   *
   * defaultValues must satisfy CreateAdminUserFormValues exactly:
   *   middleName: ""   ← string ✓ (schema uses .default(""), output is string)
   *   employeeId: ""   ← string ✓
   *   permissionKeys: [] ← string[] ✓
   *   scopes: []         ← array ✓
   *
   * The schema is passed directly as the validator — no zodValidator() wrapper,
   * no type cast. This works because createAdminUserSchema's ~standard.types
   * now aligns exactly with CreateAdminUserFormValues (all optional-in-input
   * fields have .default() so their input type is non-optional string/array).
   */
  const form = useForm<CreateAdminUserFormValues>({
    defaultValues: {
      firstName     : "",
      middleName    : "",
      lastName      : "",
      email         : "",
      employeeId    : "",
      roleId        : "",
      permissionKeys: [],
      scopes        : [],
    },
    validators: {
      onSubmit: createAdminUserSchema,
    },
    onSubmit: async ({ value }) => {
      const payload = {
        ...value,
        employeeId: value.employeeId.trim() || undefined,
        middleName: value.middleName.trim() || undefined,
        scopes    : value.scopes.length > 0 ? value.scopes : undefined,
      }

      const res = await fetch("/api/identity/users", {
        method : "POST",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify(payload),
      })

      if (res.ok) {
        const data = await res.json()
        toast.success("Admin user created", {
          description: `${value.firstName} ${value.lastName} has been added.`,
        })
        router.push(`/identity/${data.data?.id ?? ""}/review`)
      } else {
        const data = await res.json()
        form.setErrorMap({
          onSubmit: data.message ?? "Failed to create user. Please try again.",
        })
      }
    },
  })

  // Submit-level error — read directly, no Subscribe needed (only changes on submit)
  const submitError = form.state.errorMap.onSubmit

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); form.handleSubmit() }}
      className="space-y-6"
    >
      {submitError && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {getFieldError(submitError)}
        </div>
      )}

      {/* Personal details */}
      <div className="admin-card space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Personal Details</h2>

        <div className="grid gap-4 sm:grid-cols-3">
          <form.Field name="firstName" validators={{ onBlur: createAdminUserSchema.shape.firstName }}>
            {(field) => (
              <div className="space-y-1.5">
                <Label htmlFor="firstName">First name *</Label>
                <Input id="firstName" placeholder="Jane"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur} />
                {field.state.meta.errors[0] && (
                  <p className="text-xs text-destructive">{getFieldError(field.state.meta.errors[0])}</p>
                )}
              </div>
            )}
          </form.Field>

          <form.Field name="middleName">
            {(field) => (
              <div className="space-y-1.5">
                <Label htmlFor="middleName">Middle name</Label>
                <Input id="middleName" placeholder="Optional"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)} />
              </div>
            )}
          </form.Field>

          <form.Field name="lastName" validators={{ onBlur: createAdminUserSchema.shape.lastName }}>
            {(field) => (
              <div className="space-y-1.5">
                <Label htmlFor="lastName">Last name *</Label>
                <Input id="lastName" placeholder="Doe"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur} />
                {field.state.meta.errors[0] && (
                  <p className="text-xs text-destructive">{getFieldError(field.state.meta.errors[0])}</p>
                )}
              </div>
            )}
          </form.Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <form.Field name="email" validators={{ onBlur: createAdminUserSchema.shape.email }}>
            {(field) => (
              <div className="space-y-1.5">
                <Label htmlFor="email">Work email *</Label>
                <Input id="email" type="email" placeholder="jane@dailybread.com"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur} />
                {field.state.meta.errors[0] && (
                  <p className="text-xs text-destructive">{getFieldError(field.state.meta.errors[0])}</p>
                )}
              </div>
            )}
          </form.Field>

          <form.Field name="employeeId">
            {(field) => (
              <div className="space-y-1.5">
                <Label htmlFor="employeeId">Employee ID <span className="text-muted-foreground">(optional)</span></Label>
                <Input id="employeeId" placeholder="EMP-0042"
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)} />
              </div>
            )}
          </form.Field>
        </div>
      </div>

      {/* ── Role ─────────────────────────────────────────────────────── */}
      <div className="admin-card space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Role</h2>
        <p className="text-xs text-muted-foreground">
          The role defines the permission pool ceiling. Permissions can be individually adjusted below.
        </p>
        <form.Field name="roleId" validators={{ onBlur: createAdminUserSchema.shape.roleId }}>
          {(field) => (
            <div className="space-y-1.5">
              <Label>Role *</Label>
              <RoleCombobox
                roles={roles}
                value={field.state.value}
                onChange={(v) => {
                  field.handleChange(v)
                  form.setFieldValue("permissionKeys", [])
                }}
              />
              {field.state.value && (
                <p className="text-xs text-muted-foreground">
                  {roles.find((r) => r.id === field.state.value)?.description}
                </p>
              )}
              {field.state.meta.errors[0] && (
                <p className="text-xs text-destructive">{getFieldError(field.state.meta.errors[0])}</p>
              )}
            </div>
          )}
        </form.Field>
      </div>

      {/* ── Scope ────────────────────────────────────────────────────── */}
      <div className="admin-card space-y-4">
        <h2 className="text-sm font-semibold text-foreground">Geographic Scope</h2>
        <p className="text-xs text-muted-foreground">
          {isGlobalActor
            ? "Define this user's geographic access. Leave empty to assign Global scope automatically."
            : "Define this user's access within your country. Leave empty to inherit your scope."}
        </p>
        <form.Field name="scopes">
          {(field) => (
            <ScopeSelector
              isGlobalActor={isGlobalActor}
              actorCountries={actorCountries}
              value={field.state.value}
              onChange={(s) => field.handleChange(s)}
            />
          )}
        </form.Field>
      </div>

      {/*
        Permissions — form.Subscribe on roleId.

        WHY Subscribe here specifically:
        Every keystroke in firstName/email/etc. updates form state. Without
        Subscribe, those updates would re-render this entire section, which
        includes PermissionPicker — a component that fetches a pool from the
        API on mount. Subscribe(s => s.values.roleId) means this section only
        re-renders when roleId specifically changes, not on every keystroke.
        The PermissionPicker fetch is protected from spurious re-triggers.

        The inner Subscribe on permissionKeys ensures PermissionPicker receives
        the latest selection without the outer Subscribe causing a full re-render
        of the permissions card when other fields change.
      */}
      <form.Subscribe selector={(s) => s.values.roleId}>
        {(roleId) => roleId ? (
          <div className="admin-card space-y-4">
            <h2 className="text-sm font-semibold text-foreground">Permissions</h2>
            <p className="text-xs text-muted-foreground">
              Select permissions within this role's pool. Can be updated later on the user's profile.
            </p>
            <form.Subscribe selector={(s) => s.values.permissionKeys}>
              {(permKeys) => (
                <form.Field name="permissionKeys">
                  {(field) => (
                    <PermissionPicker
                      roleId={roleId}
                      selectedKeys={permKeys}
                      onChange={(keys) => field.handleChange(keys)}
                    />
                  )}
                </form.Field>
              )}
            </form.Subscribe>
          </div>
        ) : null}
      </form.Subscribe>

      {/*
        Submit button — Subscribe on isSubmitting + canSubmit only.
        These change on submit attempt, not on every field change.
        Isolating the button prevents it from re-rendering on every keystroke.
      */}
      <form.Subscribe selector={(s) => ({ isSubmitting: s.isSubmitting, canSubmit: s.canSubmit })}>
        {({ isSubmitting, canSubmit }) => (
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={isSubmitting || !canSubmit}>
              {isSubmitting ? "Creating…" : "Create User"}
            </Button>
            <Button type="button" variant="ghost" disabled={isSubmitting}
              onClick={() => router.push("/identity")}>
              Cancel
            </Button>
          </div>
        )}
      </form.Subscribe>
    </form>
  )
}