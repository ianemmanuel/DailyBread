import { redirect } from "next/navigation"

interface Props {
  params      : Promise<{ path?: string[] }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * The directory moved from /identity/manage to /identity, and details from
 * /identity/manage/[id] (and the older /[id]/review) to /identity/[id].
 * Old links keep working; the list's filters are carried over.
 */
export default async function LegacyManageRedirect({ params, searchParams }: Props) {
  const [{ path = [] }, query] = await Promise.all([params, searchParams])
  if (path[0]) redirect(`/identity/${encodeURIComponent(path[0])}`)

  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) qs.append(key, v)
  }
  redirect(qs.size > 0 ? `/identity?${qs}` : "/identity")
}
