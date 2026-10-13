import { ManagePermissionsDialog } from "@/components/identity/permissions/ManagePermissionsDialog"
import { SetupStatusNote } from "@/components/identity/setup/SetupStatusNote"
import { AllPermissionsDialog } from "./AllPermissionsDialog"
import { PermissionBadge, type PermissionSummary } from "./PermissionBadge"
import type { AdminUserDetail, PermissionOptions } from "@/types"

interface Props {
  user    : AdminUserDetail
  /** Present only when the viewer may assign this account's permissions; "unavailable" when that read failed. */
  options?: PermissionOptions | "unavailable" | null
}

/** How many badges the panel shows before the rest move behind "See all". */
const PREVIEW_COUNT = 8

function statusNote(status: string): string | null {
  if (status === "pending" || status === "invited") return "Not active yet — permissions take effect once the invitation is accepted."
  if (status === "suspended") return "Suspended — these permissions have no effect until the account is reinstated."
  if (status === "deactivated") return "Deactivated accounts hold no permissions."
  return null
}

export function PermissionsPanel({ user, options }: Props) {
  const grants: PermissionSummary[] = user.permissions
    .map(({ permission: p }) => ({ key: p.key, module: p.module, description: p.description }))
    .sort((a, b) => a.module.localeCompare(b.module) || a.key.localeCompare(b.key))
  const hidden = grants.length - PREVIEW_COUNT
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
        <SetupStatusNote setup={user.permissionSetup} />
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
        {options === "unavailable" && (
          <p role="alert" className="text-xs text-destructive">The permission editor could not be loaded. Reload the page to try again.</p>
        )}
        {grants.length === 0 ? (
          <p className="text-sm text-muted-foreground">No permissions granted.</p>
        ) : (
          <>
            <ul className="flex flex-wrap gap-1.5">
              {grants.slice(0, PREVIEW_COUNT).map((p) => <li key={p.key}><PermissionBadge permission={p} /></li>)}
            </ul>
            {hidden > 0 && (
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <AllPermissionsDialog name={[user.firstName, user.lastName].join(" ")} permissions={grants} />
                <span className="text-xs text-muted-foreground">+{hidden} more not shown</span>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}
