"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight, FileText } from "lucide-react"
import { DocumentCard } from "./DocumentCard"
import { Alert, AlertDescription } from "@repo/ui/components/alert"
import { Button } from "@repo/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@repo/ui/components/card"
import { Separator } from "@repo/ui/components/separator"
import { Progress } from "@repo/ui/components/progress"
import { toast } from "sonner"

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

interface ProgressType {
  requiredTotal: number
  uploadedRequired: number
  uploadedTotal: number
  isComplete: boolean
  percentage: number
}

interface Props {
  requirements: Requirement[]
  initialProgress: ProgressType
  applicationId: string
}

export function DocumentsForm({
  requirements: initialRequirements,
  initialProgress,
  applicationId,
}: Props) {
  const router = useRouter()

  const [requirements, setRequirements] =
    useState<Requirement[]>(initialRequirements)

  const [progress, setProgress] =
    useState<ProgressType>(initialProgress)

  const [uploadingId, setUploadingId] =
    useState<string | null>(null)

  const [deletingId, setDeletingId] =
    useState<string | null>(null)

  const [error, setError] = useState<string | null>(null)

  async function handleUpload(req: Requirement, file: File) {
    try {
      setError(null)
      setUploadingId(req.documentTypeId)

      const presignRes = await fetch(
        "/api/onboarding/documents/presign",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            applicationId,
            documentTypeId: req.documentTypeId,
            fileName: file.name,
            fileType: file.type,
          }),
        }
      )

      const presignJson = await presignRes.json()

      if (!presignRes.ok || presignJson.status !== "success") {
        const message =
          presignRes.status < 500
            ? presignJson.message || "Failed to prepare upload"
            : "Something went wrong. Please try again."
        setError(message)
        return
      }

      const { uploadUrl, storageKey } = presignJson.data

      const r2Res = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      })

      if (!r2Res.ok) {
        setError("File upload failed. Please try again.")
        return
      }

      const upsertRes = await fetch(
        "/api/onboarding/documents/upsert",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            applicationId,
            documentTypeId: req.documentTypeId,
            storageKey,
            documentName: file.name,
            fileSize: file.size,
            mimeType: file.type,
          }),
        }
      )

      const upsertJson = await upsertRes.json()

      if (!upsertRes.ok || upsertJson.status !== "success") {
        const message =
          upsertRes.status < 500
            ? upsertJson.message || "Failed to save document"
            : "Something went wrong. Please try again."
        setError(message)
        return
      }

      const { document, progress: newProgress } =
        upsertJson.data

      setRequirements((prev) =>
        prev.map((r) =>
          r.documentTypeId === req.documentTypeId
            ? {
                ...r,
                uploaded: true,
                uploadedDocument: document,
              }
            : r
        )
      )

      setProgress(newProgress)
      toast.success("Document uploaded successfully")
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setUploadingId(null)
    }
  }

  async function handleDelete(req: Requirement) {
    if (!req.uploadedDocument) return

    try {
      setError(null)
      setDeletingId(req.documentTypeId)

      const res = await fetch(
        `/api/onboarding/documents/${req.uploadedDocument.id}`,
        { method: "DELETE" }
      )

      const json = await res.json()

      if (!res.ok || json.status !== "success") {
        const message =
          res.status < 500
            ? json.message || "Failed to delete document"
            : "Something went wrong. Please try again."
        setError(message)
        return
      }

      setRequirements((prev) =>
        prev.map((r) =>
          r.documentTypeId === req.documentTypeId
            ? { ...r, uploaded: false, uploadedDocument: null }
            : r
        )
      )

      setProgress(json.data.progress)
      toast.success("Document removed")
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setDeletingId(null)
    }
  }

  async function handlePreview(doc: BackendDocument) {
    try {
      const res = await fetch(
        `/api/onboarding/documents/${doc.id}`
      )
      const json = await res.json()

      if (res.ok && json.status === "success") {
        window.open(json.data.url, "_blank")
      } else {
        toast.error("Could not open document.")
      }
    } catch {
      toast.error("Could not open document.")
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-10 pb-16">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          Upload Required Documents
        </h1>
        <p className="text-sm text-muted-foreground">
          Upload all required documents to continue your vendor onboarding.
        </p>
      </div>

      {/* Progress */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-medium">
            Application Progress
          </CardTitle>
          <CardDescription>
            {progress.uploadedRequired} of{" "}
            {progress.requiredTotal} required documents uploaded
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Progress value={progress.percentage} />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{progress.percentage}% Complete</span>
            {progress.isComplete && (
              <span className="font-medium text-green-600">
                All required documents uploaded
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Documents */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg font-medium">
            <FileText className="h-5 w-5 text-muted-foreground" />
            Documents
          </CardTitle>
          <CardDescription>
            Upload each required document below.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {requirements.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="mb-4 h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No document requirements found.
              </p>
            </div>
          ) : (
            requirements.map((req, index) => (
              <div key={req.documentTypeId}>
                <DocumentCard
                  req={req}
                  uploading={
                    uploadingId === req.documentTypeId
                  }
                  deleting={
                    deletingId === req.documentTypeId
                  }
                  onUpload={handleUpload}
                  onDelete={handleDelete}
                  onPreview={handlePreview}
                />
                {index !== requirements.length - 1 && (
                  <Separator className="mt-6" />
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Navigation Section (Part of Page) */}
      <div className="pt-6 border-t">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() =>
              router.push("/onboarding/business-details")
            }
            className="text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Business Details
          </Button>

          <Button
            size="lg"
            onClick={() =>
              router.push("/onboarding/review")
            }
            disabled={!progress.isComplete}
            className="px-8 disabled:opacity-50"
          >
            Review & Submit
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}