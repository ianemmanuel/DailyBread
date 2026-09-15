import Link from "next/link"
import { FileText } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { EmptyState } from "@/components/shared/EmptyState"
import { TablePagination } from "@/components/shared/TablePagination"
import { DocumentActionSheet } from "./DocumentActionSheet"
import type { DocumentTypeListResult } from "@/types/document-type.types"

interface Props {
  result     : DocumentTypeListResult | null
  page       : string
  countryId  : string
  countrySlug: string
  basePath   : string
  canWrite   : boolean
  emptyTitle : string
  emptyDescription: string
}

export function scopeLabel(dt: { scope: string; city: { name: string } | null }): string {
  if (dt.scope === "CITY") return dt.city ? `City — ${dt.city.name}` : "City"
  return dt.scope === "VENDOR" ? "Vendor" : "Outlet"
}

export function ActiveDocumentsTable({ result, page, countryId, countrySlug, basePath, canWrite, emptyTitle, emptyDescription }: Props) {
  if (!result || result.documentTypes.length === 0) {
    return <EmptyState icon={FileText} title={emptyTitle} description={emptyDescription} />
  }

  return (
    <div className="admin-card overflow-hidden p-0">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="text-xs uppercase tracking-wide">Name</TableHead>
              <TableHead className="hidden text-xs uppercase tracking-wide sm:table-cell">Scope</TableHead>
              <TableHead className="hidden text-xs uppercase tracking-wide sm:table-cell">Requirement</TableHead>
              <TableHead className="hidden text-xs uppercase tracking-wide md:table-cell">Applies to</TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wide">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.documentTypes.map((dt) => (
              <TableRow key={dt.id} className="hover:bg-muted/10">
                <TableCell>
                  <Link href={`/countries/${countrySlug}/documents/${dt.id}`} className="group flex items-center gap-3">
                    <div className="icon-badge icon-badge-info h-9 w-9 shrink-0">
                      <FileText className="h-4 w-4" />
                    </div>
                    <span className="font-medium text-foreground transition-colors group-hover:text-primary">
                      {dt.name}
                    </span>
                  </Link>
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                  {scopeLabel(dt)}
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <span className={dt.isRequired ? "badge-warning" : "badge-neutral"}>
                    {dt.isRequired ? "Mandatory" : "Optional"}
                  </span>
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                  {dt.vendorTypeConfigs.length === 0
                    ? "All vendor categories"
                    : dt.vendorTypeConfigs.map((c) => c.vendorType.name).join(", ")}
                </TableCell>
                <TableCell className="text-right">
                  {canWrite && <DocumentActionSheet documentType={dt} countryId={countryId} countrySlug={countrySlug} />}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <TablePagination
        total={result.total}
        page={page}
        totalPages={result.totalPages}
        basePath={basePath}
        itemLabel="documents"
      />
    </div>
  )
}
