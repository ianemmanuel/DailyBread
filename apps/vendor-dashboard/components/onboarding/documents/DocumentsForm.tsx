'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, FileText, CheckCircle2 } from 'lucide-react'
import { DocumentCard } from './DocumentCard'
import { Alert, AlertDescription } from '@repo/ui/components/alert'
import { Button } from '@repo/ui/components/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@repo/ui/components/card'
import { Progress } from '@repo/ui/components/progress'
import { cn } from '@repo/ui/lib/utils'
import { toast } from 'sonner'

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

interface ProgressData {
  requiredTotal: number
  uploadedRequired: number
  uploadedTotal: number
  isComplete: boolean
  percentage: number
}

interface Props {
  requirements: Requirement[]
  initialProgress: ProgressData
  applicationId: string
}

export function DocumentsForm({ requirements: initialRequirements, initialProgress, applicationId }: Props) {
  const router = useRouter()
  const [requirements, setRequirements] = useState<Requirement[]>(initialRequirements)
  const [progress, setProgress]         = useState<ProgressData>(initialProgress)
  const [uploadingId, setUploadingId]   = useState<string | null>(null)
  const [deletingId, setDeletingId]     = useState<string | null>(null)
  const [error, setError]               = useState<string | null>(null)

  async function handleUpload(req: Requirement, file: File) {
    try {
      setError(null)
      setUploadingId(req.documentTypeId)

      // Step 1: get presigned URL
      const presignRes = await fetch('/api/onboarding/documents/presign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId,
          documentTypeId: req.documentTypeId,
          fileName: file.name,
          fileType: file.type,
        }),
      })
      const presignJson = await presignRes.json()
      if (!presignRes.ok || presignJson.status !== 'success') {
        setError(presignRes.status < 500 ? presignJson.message || 'Failed to prepare upload' : 'Something went wrong. Please try again.')
        return
      }

      // Step 2: upload to storage
      const r2Res = await fetch(presignJson.data.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      })
      if (!r2Res.ok) {
        setError('File upload failed. Please try again.')
        return
      }

      // Step 3: register document
      const upsertRes = await fetch('/api/onboarding/documents/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId,
          documentTypeId: req.documentTypeId,
          storageKey: presignJson.data.storageKey,
          documentName: file.name,
          fileSize: file.size,
          mimeType: file.type,
        }),
      })
      const upsertJson = await upsertRes.json()
      if (!upsertRes.ok || upsertJson.status !== 'success') {
        setError(upsertRes.status < 500 ? upsertJson.message || 'Failed to save document' : 'Something went wrong. Please try again.')
        return
      }

      const { document, progress: newProgress } = upsertJson.data
      setRequirements((prev) =>
        prev.map((r) => r.documentTypeId === req.documentTypeId ? { ...r, uploaded: true, uploadedDocument: document } : r)
      )
      setProgress(newProgress)
      toast.success('Document uploaded')
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setUploadingId(null)
    }
  }

  async function handleDelete(req: Requirement) {
    if (!req.uploadedDocument) return
    try {
      setError(null)
      setDeletingId(req.documentTypeId)

      const res = await fetch(`/api/onboarding/documents/${req.uploadedDocument.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok || json.status !== 'success') {
        setError(res.status < 500 ? json.message || 'Failed to delete document' : 'Something went wrong. Please try again.')
        return
      }

      setRequirements((prev) =>
        prev.map((r) => r.documentTypeId === req.documentTypeId ? { ...r, uploaded: false, uploadedDocument: null } : r)
      )
      setProgress(json.data.progress)
      toast.success('Document removed')
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setDeletingId(null)
    }
  }

  async function handlePreview(doc: BackendDocument) {
    try {
      const res  = await fetch(`/api/onboarding/documents/${doc.id}`)
      const json = await res.json()
      if (res.ok && json.status === 'success') {
        window.open(json.data.url, '_blank', 'noopener,noreferrer')
      } else {
        toast.error('Could not open document.')
      }
    } catch {
      toast.error('Could not open document.')
    }
  }

  const required  = requirements.filter((r) => r.isRequired)
  const optional  = requirements.filter((r) => !r.isRequired)

  return (
    <div className="space-y-6">

      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Upload Documents</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload all required documents to proceed to review.
        </p>
      </div>

      {/* Progress card */}
      <Card className="border-border/60 shadow-sm">
        <CardContent className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Upload progress</p>
              <p className="text-xs text-muted-foreground">
                {progress.uploadedRequired} of {progress.requiredTotal} required documents
              </p>
            </div>
            {progress.isComplete ? (
              <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
                <CheckCircle2 className="h-4 w-4" />
                All required docs uploaded
              </div>
            ) : (
              <span className="text-sm font-semibold text-foreground">{progress.percentage}%</span>
            )}
          </div>
          <Progress
            value={progress.percentage}
            className={cn('h-2', progress.isComplete && '[&>div]:bg-emerald-500')}
          />
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Required documents */}
      {required.length > 0 && (
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold">Required Documents</CardTitle>
                <CardDescription className="text-sm">
                  These must be uploaded before you can submit
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {required.map((req) => (
              <DocumentCard
                key={req.documentTypeId}
                req={req}
                uploading={uploadingId === req.documentTypeId}
                deleting={deletingId === req.documentTypeId}
                onUpload={handleUpload}
                onDelete={handleDelete}
                onPreview={handlePreview}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Optional documents */}
      {optional.length > 0 && (
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary">
                <FileText className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold">Optional Documents</CardTitle>
                <CardDescription className="text-sm">
                  These may help speed up your application review
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            {optional.map((req) => (
              <DocumentCard
                key={req.documentTypeId}
                req={req}
                uploading={uploadingId === req.documentTypeId}
                deleting={deletingId === req.documentTypeId}
                onUpload={handleUpload}
                onDelete={handleDelete}
                onPreview={handlePreview}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {requirements.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-border/60 bg-white py-16 text-center">
          <FileText className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No document requirements found.</p>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between border-t border-border/50 pt-6">
        <Button
          variant="ghost"
          className="gap-2 text-muted-foreground hover:text-foreground"
          onClick={() => router.push('/onboarding/business-details')}
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>

        <Button
          size="lg"
          className="min-w-[160px] gap-2"
          disabled={!progress.isComplete}
          onClick={() => router.push('/onboarding/review')}
        >
          Review & Submit
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

    </div>
  )
}