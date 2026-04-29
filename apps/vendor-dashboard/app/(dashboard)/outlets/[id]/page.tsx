import { auth } from "@clerk/nextjs/server"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import {
  MapPin, Phone, Mail, Clock, Star, Crown,
  ChevronLeft, Utensils,
} from "lucide-react"
import { Button } from "@repo/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card"
import { PageHeader } from "@/components/dashboard/layout/PageHeader"
import { PageGrid, SectionGrid } from "@/components/dashboard/layout/DashboardShell"
import { OutletStatusBadges } from "@/components/outlets/OutletStatusBadges"
import { UpdateOutletForm } from "@/components/outlets/UpdateOutletForm"
import { OperatingHoursForm } from "@/components/outlets/OperatingHoursForm"
import type { Outlet } from "@/types/outlet"

const BACKEND = process.env.BACKEND_API_URL

async function getOutlet(token: string, id: string): Promise<Outlet | null> {
  try {
    const res = await fetch(`${BACKEND}/vendor/v1/outlets/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
      next   : { tags: [`vendor-outlet-${id}`] },
    })
    if (res.status === 404) return null
    if (!res.ok) return null
    const data = await res.json()
    return data.data ?? null
  } catch {
    return null
  }
}

/* ── Small server-rendered stat tile ── */
function StatTile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 text-center">
      <span className="text-lg font-bold text-[var(--foreground)]">{value}</span>
      <span className="text-xs text-[var(--muted-foreground)]">{label}</span>
    </div>
  )
}

export default async function OutletDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { getToken } = await auth()
  const token = await getToken()
  if (!token) redirect("/sign-in")

  const outlet = await getOutlet(token, id)
  if (!outlet) notFound()

  const isOperational =
    !outlet.vendorDisabledAt &&
    outlet.adminStatus === "ACTIVE" &&
    !outlet.isTemporarilyClosed

  return (
    <PageGrid>
      {/* ── Back + header ── */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="rounded-xl" asChild>
          <Link href="/dashboard/outlets">
            <ChevronLeft className="size-4" />
          </Link>
        </Button>
        <PageHeader
          title={outlet.name}
          description={outlet.city?.name ?? ""}
          actions={
            <div className="flex items-center gap-2">
              {outlet.isMainOutlet && (
                <span className="flex items-center gap-1.5 badge-primary">
                  <Crown className="size-3" />Primary
                </span>
              )}
              <OutletStatusBadges outlet={outlet} />
            </div>
          }
        />
      </div>

      {/* ── Hero overview card ── */}
      <Card className="dash-card border-0">
        <CardContent className="p-6">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">

            {/* Left: address + contact */}
            <div className="space-y-2 text-sm text-[var(--muted-foreground)]">
              <p className="flex items-center gap-2">
                <MapPin className="size-4 shrink-0 text-[var(--primary)]" />
                {outlet.addressLine1}
                {outlet.neighborhood ? `, ${outlet.neighborhood}` : ""}
              </p>
              {outlet.phone && (
                <p className="flex items-center gap-2">
                  <Phone className="size-4 shrink-0 text-[var(--primary)]" />
                  {outlet.phone}
                </p>
              )}
              {outlet.email && (
                <p className="flex items-center gap-2">
                  <Mail className="size-4 shrink-0 text-[var(--primary)]" />
                  {outlet.email}
                </p>
              )}
              {outlet.bio && (
                <p className="mt-3 max-w-md italic text-[var(--muted-foreground)]/80">
                  "{outlet.bio}"
                </p>
              )}
            </div>

            {/* Right: quick stats */}
            <div
              className="grid grid-cols-3 gap-4 rounded-xl px-6 py-4 sm:grid-cols-3"
              style={{ background: "color-mix(in oklch, var(--muted) 30%, transparent)" }}
            >
              <StatTile label="Meals" value={outlet._count?.meals ?? 0} />
              <StatTile
                label="Rating"
                value={
                  <span className="flex items-center justify-center gap-1">
                    <Star className="size-4" style={{ fill: "var(--primary)", color: "var(--primary)" }} />
                    {outlet.ratings > 0 ? outlet.ratings.toFixed(1) : "—"}
                  </span>
                }
              />
              <StatTile
                label="Status"
                value={
                  <span
                    className="inline-block size-3 rounded-full"
                    style={{
                      background: isOperational ? "var(--success)" : "var(--muted-foreground)",
                      boxShadow : isOperational
                        ? "0 0 0 3px color-mix(in oklch, var(--success) 20%, transparent)"
                        : "none",
                    }}
                  />
                }
              />
            </div>
          </div>

          {/* Cuisines */}
          {outlet.cuisines.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {outlet.cuisines.map(({ cuisine }) => (
                <span key={cuisine.id} className="badge-base badge-primary">
                  <Utensils className="size-2.5" />
                  {cuisine.name}
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Edit form + Operating hours side-by-side on lg ── */}
      <SectionGrid cols={3}>
        {/* Edit form takes 2/3 */}
        <div className="lg:col-span-2">
          <Card className="dash-card border-0">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold">Edit Details</CardTitle>
            </CardHeader>
            <CardContent>
              <UpdateOutletForm outlet={outlet} />
            </CardContent>
          </Card>
        </div>

        {/* Operating hours takes 1/3 */}
        <Card className="dash-card border-0">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Clock className="size-4 text-[var(--primary)]" />
              Hours
            </CardTitle>
          </CardHeader>
          <CardContent>
            <OperatingHoursForm
              outletId={outlet.id}
              existing={outlet.operatingHours}
            />
          </CardContent>
        </Card>
      </SectionGrid>

      {/* Flag warning */}
      {outlet.reviewStatus === "FLAGGED" && outlet.flagReasons.length > 0 && (
        <div
          className="rounded-xl border px-5 py-4 text-sm"
          style={{
            borderColor: "color-mix(in oklch, var(--warning) 40%, transparent)",
            background : "color-mix(in oklch, var(--warning) 8%, transparent)",
            color      : "var(--warning)",
          }}
        >
          <p className="font-semibold">⚠ This outlet is under review</p>
          <p className="mt-1 text-xs opacity-80">
            Reasons: {outlet.flagReasons.join(", ").replace(/_/g, " ").toLowerCase()}
          </p>
        </div>
      )}
    </PageGrid>
  )
}