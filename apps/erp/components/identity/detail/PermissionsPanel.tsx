import { ManagePermissionsDialog } from "@/components/identity/permissions/ManagePermissionsDialog"
import type { AdminUserDetail, PermissionOptions } from "@/types"

interface Props {
  user    : AdminUserDetail
  /** Present only when the viewer may assign this account's permissions; "unavailable" when that read failed. */
  options?: PermissionOptions | "unavailable" | null
}

function statusNote(status: string): string | null {
  if (status === "pending" || status === "invited") return "Not active yet — permissions take effect once the invitation is accepted."
  if (status === "suspended") return "Suspended — these permissions have no effect until the account is reinstated."
  if (status === "deactivated") return "Deactivated accounts hold no permissions."
  return null
}

export function PermissionsPanel({ user, options }: Props) {
  const grants = user.permissions.map((g) => g.permission)
  const byModule = new Map<string, string[]>()
  for (const p of grants) byModule.set(p.module, [...(byModule.get(p.module) ?? []), p.key])
  const note = statusNote(user.status)

  return (
    <section aria-labelledby="account-permissions" className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div>
          <h2 id="account-permissions" className="text-sm font-semibold text-foreground">
            Permissions <span className="font-normal text-muted-foreground">({grants.length})</span>
          </h2>
          {user.role && <p className="text-xs text-muted-foreground">Granted within the {user.role.displayName} pool.</p>}
        </div>
        {options && options !== "unavailable" && <ManagePermissionsDialog options={options} />}
      </div>

      <div className="space-y-3 px-4 py-3">
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
        {options === "unavailable" && (
          <p role="alert" className="text-xs text-destructive">The permission editor could not be loaded. Reload the page to try again.</p>
        )}
        {grants.length === 0 ? (
          <p className="text-sm text-muted-foreground">No permissions granted.</p>
        ) : (
          [...byModule.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([module, keys]) => (
            <div key={module} className="flex flex-col gap-1.5 sm:flex-row sm:gap-4">
              <p className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:w-36 sm:pt-0.5">{module.replace(/_/g, " ")}</p>
              <ul className="flex flex-wrap gap-1.5">
                {keys.sort().map((k) => (
                  <li key={k} className="rounded-md bg-muted/50 px-2 py-0.5 font-mono text-xs text-foreground">{k.split(":").slice(1).join(":")}</li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </section>
  )
}
