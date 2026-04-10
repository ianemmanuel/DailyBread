import type { Metadata }    from "next"
import { redirect }         from "next/navigation"
import { revalidateTag }    from "next/cache"
import { auth }             from "@clerk/nextjs/server"
import Link                 from "next/link"
import { ArrowLeft }        from "lucide-react"
import { Button }           from "@repo/ui/components/button"
import { Input }            from "@repo/ui/components/input"
import { Label }            from "@repo/ui/components/label"
import { adminFetch }       from "@/lib/api"
import { RoleSelect }       from "@/components/identity/RoleSelect"
import { PermissionPicker } from "@/components/identity/PermissionPicker"
import type { AdminSessionData, ApiSuccess } from "@repo/types/admin-app"
import { AdminPermissions } from "@repo/types/admin-app"
import type { AdminRole, AdminPermission } from "@/types"

export const metadata: Metadata = { title: "New Admin User" }

/**
 * Create admin user page.
 *
 * Server component with a server action for form submission.
 * Roles and permissions pool are fetched server-side.
 * Permission gate: requires ADMIN_USERS_CREATE.
 */
export default async function NewAdminUserPage() {
  const { getToken, userId } = await auth()
  if (!userId) redirect("/sign-in")

  const token = await getToken()
  const sessionRes = await fetch(
    `${process.env.BACKEND_API_URL}/admin/v1/auth/session`,
    { headers: { Authorization: `Bearer ${token}` }, next: { revalidate: 300 } },
  )
  if (!sessionRes.ok) redirect("/sign-in")
  const { data: session }: ApiSuccess<AdminSessionData> = await sessionRes.json()

  if (!session.permissions.includes(AdminPermissions.ADMIN_USERS_CREATE)) {
    redirect("/identity")
  }

  // Fetch roles for the dropdown
  const roles = await adminFetch<AdminRole[]>("/admin/v1/users/meta/roles", {
    next: { revalidate: 3600 },
  })

  // Server action
  async function createUser(formData: FormData) {
    "use server"

    const { getToken } = await auth()
    const token        = await getToken()

    const email          = formData.get("email")          as string
    const fullName       = formData.get("fullName")       as string
    const roleId         = formData.get("roleId")         as string
    const permissionKeys = formData.getAll("permissions") as string[]

    const res = await fetch(`${process.env.BACKEND_API_URL}/admin/v1/users`, {
      method : "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization : `Bearer ${token}`,
      },
      body: JSON.stringify({ email, fullName, roleId, permissionKeys }),
    })

    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.message ?? "Failed to create user")
    }

    revalidateTag("admin-users")
    redirect("/identity")
  }

  return (
    <div className="page-content animate-slide-up">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm" className="-ml-1">
          <Link href="/identity">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back
          </Link>
        </Button>
      </div>

      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          Add Admin User
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Creates a user record. You can send the invitation in the next step.
        </p>
      </div>

      <form action={createUser} className="max-w-2xl space-y-6">

        {/* Basic info */}
        <div className="admin-card space-y-4">
          <h2 className="text-sm font-semibold text-foreground">Basic Information</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Full name</Label>
              <Input id="fullName" name="fullName" placeholder="Jane Doe" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Work email</Label>
              <Input id="email" name="email" type="email" placeholder="jane@dailybread.com" required />
            </div>
          </div>
        </div>

        {/* Role */}
        <div className="admin-card space-y-4">
          <h2 className="text-sm font-semibold text-foreground">Role</h2>
          <p className="text-xs text-muted-foreground">
            The role determines which permissions can be granted. Only permissions in the role's pool are available.
          </p>
          <RoleSelect roles={roles} />
        </div>

        {/* Permissions — dynamic based on selected role */}
        <div className="admin-card space-y-4">
          <h2 className="text-sm font-semibold text-foreground">Permissions</h2>
          <p className="text-xs text-muted-foreground">
            Select the permissions to grant. Must be within the chosen role's pool.
          </p>
          <PermissionPicker />
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit">Create User</Button>
          <Button asChild variant="ghost">
            <Link href="/identity">Cancel</Link>
          </Button>
        </div>

      </form>
    </div>
  )
}