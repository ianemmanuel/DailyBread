import type { Metadata } from "next"
import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { ShieldCheck, KeyRound } from "lucide-react"
import { ScopeDisplay } from "@/components/dashboard/overview/ScopedDisplay"
import type { AdminSessionData, ApiSuccess } from "@repo/types/admin-app"

export const metadata: Metadata = { title: "Overview" }

export default async function OverviewPage() {
  const { getToken, userId } = await auth()
  if (!userId) redirect("/sign-in")

  const token = await getToken()

  const res = await fetch(
    `${process.env.BACKEND_API_URL}/admin/v1/auth/session`,
    {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 300 },
    }
  )

  if (!res.ok) redirect("/sign-in")

  const { data: session }: ApiSuccess<AdminSessionData> = await res.json()

  const first = session.firstName?.trim() ?? ""
  const last = session.lastName?.trim() ?? ""
  console.log("Session data:", session)
  // Full display name
  const displayName = [
    session.firstName,
    session.middleName,
    session.lastName,
  ]
    .filter(Boolean)
    .join(" ")

  // Initials (FIRST + LAST)
  const initials = (
    (first[0] ?? "") + (last[0] ?? "") || first[0] || "?"
  ).toUpperCase()

  // First name for greeting
  const greetingName = first || "there"

  // Group permissions
  const permissionsByModule = session.permissions.reduce<Record<string, string[]>>(
    (acc, p) => {
      const module = p.split(":")[0] ?? "other"
      ;(acc[module] ??= []).push(p)
      return acc
    },
    {}
  )

  return (
    <div className="mx-auto max-w-5xl space-y-6 animate-slide-up">

      {/* Page heading */}
      <div>
        <p className="text-xs font-mono tracking-widest uppercase text-muted-foreground/60 mb-1">
          Dashboard
        </p>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl">
          Good day, {greetingName}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Here&apos;s an overview of your access and permissions.
        </p>
      </div>

      {/* Identity + scope row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">

        {/* Identity card */}
        <div className="rounded-xl border border-border/60 bg-card p-5 sm:col-span-2 lg:col-span-1">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-foreground truncate">
                {displayName || "—"}
              </p>
              <p className="text-sm text-muted-foreground truncate">
                {session.email}
              </p>
              {session.role && (
                <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                  {session.role.displayName}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Scope card */}
        <div className="rounded-xl border border-border/60 bg-card p-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">
            Geographic Scope
          </p>
          <ScopeDisplay scope={session.scope} variant="card" />
        </div>

        {/* Permission count card */}
        <div className="rounded-xl border border-border/60 bg-card p-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">
            Permissions
          </p>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary">
              <KeyRound className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-2xl font-semibold tabular-nums text-foreground">
                {session.permissions.length}
              </p>
              <p className="text-xs text-muted-foreground">
                across {Object.keys(permissionsByModule).length} modules
              </p>
            </div>
          </div>
        </div>

      </div>

      {/* Permissions breakdown */}
      <div className="rounded-xl border border-border/60 bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold text-foreground">
            Permission Breakdown
          </h2>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(permissionsByModule).map(([module, perms]) => (
            <div
              key={module}
              className="rounded-lg border border-border/40 bg-background/50 px-4 py-3"
            >
              <p className="mb-2 text-xs font-semibold capitalize text-muted-foreground">
                {module.replace(/_/g, " ")}
              </p>
              <ul className="space-y-1">
                {perms.map((p) => (
                  <li key={p} className="flex items-center gap-1.5">
                    <span className="h-1 w-1 rounded-full bg-primary shrink-0" />
                    <span className="font-mono text-[11px] text-muted-foreground/80">
                      {p.split(":").slice(1).join(":")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}