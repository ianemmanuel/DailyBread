import { Globe, Mail, Phone, ImageOff, AlertTriangle } from "lucide-react"
import type { ProfileFlagDetail, VendorProfileAdminDetail } from "@/types"

/**
 * The profile as a customer would meet it, which is the only way to judge it.
 *
 * Rendered as the storefront card rather than a field list on purpose: an
 * impersonating name, a cover photo of the wrong thing and a tagline that reads
 * badly are all things you see rather than read row by row. **This is the first
 * admin surface anywhere that shows the logo and cover at all** — the queue
 * could only moderate flagged text, so an inappropriate image had nothing to
 * act on.
 *
 * Flagged fields are outlined where they sit, so the finding and the text it is
 * about are never separated by a scroll.
 */

interface Props {
  profile: VendorProfileAdminDetail
}

function flagsFor(details: ProfileFlagDetail[] | null, field: string): ProfileFlagDetail[] {
  return (details ?? []).filter((d) => d.field === field)
}

export function VendorProfilePreview({ profile }: Props) {
  const flagged = (field: string) => flagsFor(profile.flagDetails, field).length > 0

  return (
    <div className="admin-card overflow-hidden p-0">
      {/* Cover */}
      <div className="relative h-40 w-full bg-muted sm:h-52">
        {profile.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed R2 URL, short-lived and not a known host
          <img src={profile.coverImageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 text-muted-foreground">
            <ImageOff className="h-5 w-5" />
            <span className="text-xs">No cover image</span>
          </div>
        )}
      </div>

      <div className="space-y-5 p-5">
        {/* Logo + name, overlapping the cover the way a storefront header does */}
        <div className="-mt-14 flex flex-wrap items-end gap-4">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl border-4 border-card bg-muted shadow-[var(--shadow-xs)]">
            {profile.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- signed R2 URL
              <img src={profile.logoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                <ImageOff className="h-4 w-4" />
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1 pb-0.5">
            <FieldFlagWrap flagged={flagged("displayName")}>
              <h2 className="font-display text-xl font-semibold text-foreground">{profile.displayName}</h2>
            </FieldFlagWrap>
            {profile.tagline && (
              <FieldFlagWrap flagged={flagged("tagline")}>
                <p className="mt-0.5 text-sm text-muted-foreground">{profile.tagline}</p>
              </FieldFlagWrap>
            )}
          </div>
        </div>

        {(profile.cuisines.length > 0 || profile.dietaryTags.length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {profile.cuisines.map((c) => (
              <span key={c.id} className="badge-neutral">{c.name}</span>
            ))}
            {profile.dietaryTags.map((d) => (
              <span key={d.id} className="rounded-full border border-success/30 bg-success-bg px-2.5 py-0.5 text-xs font-medium text-success">
                {d.name}
              </span>
            ))}
          </div>
        )}

        {profile.description && (
          <Block label="Description" flagged={flagged("description")}>
            {profile.description}
          </Block>
        )}

        {profile.story && (
          <Block label="Their story" flagged={flagged("story")}>
            {profile.story}
          </Block>
        )}

        {(profile.publicEmail || profile.publicPhone || profile.website) && (
          <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-border/70 pt-4 text-sm">
            {profile.publicEmail && (
              <ContactLine icon={Mail} href={`mailto:${profile.publicEmail}`} text={profile.publicEmail} />
            )}
            {profile.publicPhone && (
              <ContactLine icon={Phone} href={`tel:${profile.publicPhone}`} text={profile.publicPhone} />
            )}
            {profile.website && (
              <ContactLine icon={Globe} href={profile.website} text={profile.website} external />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/** A flagged field is outlined in place — the finding and the text it is about
 *  should never be separated by a scroll. */
function FieldFlagWrap({ flagged, children }: { flagged: boolean; children: React.ReactNode }) {
  if (!flagged) return <>{children}</>
  return (
    <div className="-mx-1.5 rounded-lg border border-warning/40 bg-warning-bg px-1.5 py-0.5">
      {children}
    </div>
  )
}

function Block({
  label, flagged, children,
}: { label: string; flagged: boolean; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
        {flagged && (
          <span className="inline-flex items-center gap-1 text-warning">
            <AlertTriangle className="h-3 w-3" />
            Flagged
          </span>
        )}
      </p>
      <FieldFlagWrap flagged={flagged}>
        <p className="mt-1 whitespace-pre-line break-words text-sm text-foreground">{children}</p>
      </FieldFlagWrap>
    </div>
  )
}

function ContactLine({
  icon: Icon, href, text, external,
}: {
  icon: React.ComponentType<{ className?: string }>
  href: string
  text: string
  external?: boolean
}) {
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="inline-flex min-w-0 items-center gap-1.5 text-muted-foreground transition-colors hover:text-primary"
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{text}</span>
    </a>
  )
}
