import { redirect } from "next/navigation"

/*
 * /tax has no landing page of its own — the section is two real screens and a
 * third that only restates them. Countries is the one an admin opens daily
 * (rates change by law, the catalog almost never does), so it is the default.
 */
export default function TaxPage() {
  redirect("/tax/countries")
}
