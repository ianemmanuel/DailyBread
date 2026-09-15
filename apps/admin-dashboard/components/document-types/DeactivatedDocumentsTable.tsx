import { Ban } from "lucide-react"
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
import { DocumentActivateButton } from "./DocumentActivateButton"
import type { DocumentTypeListResult } from "@/types/document-type.types"

interface Props {
  result   : DocumentTypeListResult | null
  page     : string
  countryId: string
  basePath : string
  canWrite : boolean
}

export function DeactivatedDocumentsTable({ result, page, countryId, basePath, canWrite }: Props) {
  if (!result || result.documentTypes.length === 0) {
    return (
      <EmptyState
        icon={Ban}
        title="No deactivated documents"
        description="Documents that get deactivated in this country will show up here, with who did it, when, and why."
      />
    )
  }

  return (
    <div className="admin-card overflow-hidden p-0">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="text-xs uppercase tracking-wide">Name</TableHead>
              <TableHead className="hidden text-xs uppercase tracking-wide sm:table-cell">Deactivated by</TableHead>
              <TableHead className="hidden text-xs uppercase tracking-wide sm:table-cell">Deactivated at</TableHead>
              <TableHead className="text-xs uppercase tracking-wide">Reason</TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wide">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.documentTypes.map((dt) => (
              <TableRow key={dt.id} className="hover:bg-muted/10">
                <TableCell className="font-medium text-foreground">{dt.name}</TableCell>
                <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                  {dt.deactivatedByName ?? "—"}
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                  {dt.deactivatedAt ? new Date(dt.deactivatedAt).toLocaleDateString() : "—"}
                </TableCell>
                <TableCell className="max-w-xs truncate text-sm text-muted-foreground" title={dt.deactivationReason ?? undefined}>
                  {dt.deactivationReason ?? "—"}
                </TableCell>
                <TableCell className="text-right">
                  {canWrite && <DocumentActivateButton documentTypeId={dt.id} countryId={countryId} />}
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
        itemLabel="deactivated documents"
      />
    </div>
  )
}
