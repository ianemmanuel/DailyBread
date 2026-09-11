import { redirect } from "next/navigation"

/** Inspections moved under Outlets (2026-09-10) — see the outlets redirect. */
export default function LegacyInspectionsRedirect() {
  redirect("/outlets/inspections")
}
