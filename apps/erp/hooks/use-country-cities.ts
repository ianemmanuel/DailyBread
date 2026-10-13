"use client"

import { useEffect, useState } from "react"

interface CityOption {
  id  : string
  name: string
}

/**
 * Active cities for a country — used by the document-type forms' city
 * picker (CITY scope). Fetches lazily, only when a countryId is given, via
 * the existing GET /api/countries/[countryRef]/cities proxy.
 */
export function useCountryCities(countryId: string | undefined) {
  const [cities, setCities]   = useState<CityOption[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!countryId) { setCities([]); return }
    let cancelled = false
    setLoading(true)
    fetch(`/api/countries/${countryId}/cities?status=ACTIVE&pageSize=200`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return
        // sendSuccess envelope: { status, message, data: { cities, ... } }
        const list: { id: string; name: string }[] = data?.data?.cities ?? []
        setCities(list.map((c) => ({ id: c.id, name: c.name })))
      })
      .catch(() => { if (!cancelled) setCities([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [countryId])

  return { cities, loading }
}
