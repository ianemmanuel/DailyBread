import type { Metadata } from "next"
import { redirect } from "next/navigation"
import Link from "next/link"
import { auth } from "@clerk/nextjs/server"
import { ArrowLeft } from "lucide-react"
import { Button } from "@repo/ui/components/button"
import { adminFetch } from "@/lib/api"
import { CreateUserForm } from "@/components/identity/CreateUserForm"
import type { AdminSessionData, ApiSuccess } from "@repo/types/admin-app"
import { AdminPermissions } from "@repo/types/admin-app"
import type { AdminRole }   from "@/types"

export const metadata: Metadata = { title: "New Admin User" }

export default async function NewAdminUserPage() {
  const { getToken, userId } = await auth()
  if (!userId) redirect("/sign-in")

  const token = await getToken()
  const sessionRes = await fetch(
    `${process.env.BACKEND_API_URL}/admin/v1/auth/session`,
    { 
      headers: { Authorization: `Bearer ${token}` }, 
      next: { revalidate: 300 } 
    },
  )
  if (!sessionRes.ok) redirect("/sign-in")
  const { data: session }: ApiSuccess<AdminSessionData> = await sessionRes.json()

  if (!session.permissions.includes(AdminPermissions.ADMIN_USERS_CREATE)) {
    redirect("/identity")
  }

  const roles = await adminFetch<AdminRole[]>("/admin/v1/users/meta/roles", {
    next: { revalidate: 3600 },
  })

  return (
    <div className="page-content animate-slide-up">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-1">
          <Link href="/identity"><ArrowLeft className="mr-1.5 h-4 w-4" />Back</Link>
        </Button>
      </div>

      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          Add Admin User
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Creates a user record. Send the invitation in the next step.
        </p>
      </div>

      {/* Form is a client component — handles posting and loading states */}
      <CreateUserForm roles={roles} />
    </div>
  )
}