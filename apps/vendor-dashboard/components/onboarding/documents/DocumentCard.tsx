'use client'

import { Button } from '@repo/ui/components/button'
import { Badge } from '@repo/ui/components/badge'
import { Loader2, Eye, Trash2, CheckCircle2, Upload } from 'lucide-react'
import { cn } from '@repo/ui/lib/utils'

interface BackendDocument {
  id: string
  documentName: string | null
  documentTypeId: string
  storageKey: string
  mimeType: string | null
  status: string
}

interface Requirement {
  documentTypeId: string
  name: string
  isRequired: boolean
  uploaded: boolean
  uploadedDocument: BackendDocument | null
}

interface DocumentCardProps {
  req: Requirement
  uploading: boolean
  deleting: boolean
  onUpload: (req: Requirement, file: File) => void
  onDelete: (req: Requirement) => void
  onPreview: (doc: BackendDocument) => void
}

const ACCEPTED_TYPES = '.pdf,.png,.jpg,.jpeg'

export function DocumentCard({
  req,
  uploading,
  deleting,
  onUpload,
  onDelete,
  onPreview,
}: DocumentCardProps) {
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) onUpload(req, file)
    e.target.value = ''
  }

  const isUploaded = req.uploaded && req.uploadedDocument
  const isBusy = uploading || deleting

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-xl border bg-white p-4 transition-colors sm:flex-row sm:items-center sm:justify-between',
        isUploaded
          ? 'border-emerald-200 bg-emerald-50/30'
          : 'border-border/60'
      )}
    >
      {/* Left — name + status */}
      <div className="flex min-w-0 items-start gap-3">
        {/* Status icon */}
        <div className={cn(
          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
          isUploaded ? 'bg-emerald-100 text-emerald-600' : 'bg-secondary text-muted-foreground'
        )}>
          {isUploaded
            ? <CheckCircle2 className="h-4 w-4" />
            : <Upload className="h-4 w-4" />
          }
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground">{req.name}</span>
            <Badge
              variant="outline"
              className={cn(
                'text-[10px] font-medium',
                req.isRequired
                  ? 'border-primary/20 bg-primary/8 text-primary'
                  : 'border-border/60 text-muted-foreground'
              )}
            >
              {req.isRequired ? 'Required' : 'Optional'}
            </Badge>
          </div>

          {isUploaded && req.uploadedDocument?.documentName && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {req.uploadedDocument.documentName}
            </p>
          )}

          {!isUploaded && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              PDF, PNG, or JPG accepted
            </p>
          )}
        </div>
      </div>

      {/* Right — actions */}
      <div className="flex shrink-0 items-center gap-2 self-end sm:self-auto">
        {isUploaded && req.uploadedDocument && (
          <>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => onPreview(req.uploadedDocument!)}
              aria-label="Preview document"
            >
              <Eye className="h-4 w-4" />
            </Button>

            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              disabled={isBusy}
              onClick={() => onDelete(req)}
              aria-label="Delete document"
            >
              {deleting
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Trash2 className="h-4 w-4" />
              }
            </Button>
          </>
        )}

        {/* Upload / Replace button */}
        <label className={cn('cursor-pointer', isBusy && 'pointer-events-none opacity-50')}>
          <Button size="sm" variant={isUploaded ? 'outline' : 'default'} disabled={isBusy} asChild>
            <span>
              {uploading ? (
                <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Uploading...</>
              ) : isUploaded ? (
                'Replace'
              ) : (
                <><Upload className="mr-1.5 h-3.5 w-3.5" /> Upload</>
              )}
            </span>
          </Button>
          <input type="file" accept={ACCEPTED_TYPES} onChange={handleChange} className="hidden" />
        </label>
      </div>
    </div>
  )
}