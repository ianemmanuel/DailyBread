import {
  prisma,
  DocumentTypeStatus,
  DocumentStatus,
} from "@repo/db"

export const DocumentRequirementService = {
  async getAllowedTypes(application: {
    countryId: string
    vendorTypeId: string
  }) {
    return prisma.documentTypeConfig.findMany({
      where: {
        countryId: application.countryId,
        scope: "VENDOR",
        status: DocumentTypeStatus.ACTIVE,
        vendorTypeConfigs: {
          some: {
            vendorTypeId: application.vendorTypeId,
          },
        },
      },
      include: {
        vendorTypeConfigs: {
          where: {
            vendorTypeId: application.vendorTypeId,
          },
          select: {
            isRequired: true,
          },
        },
      },
    })
  },

  async validateDocumentTypeForUpload(application: {
    id: string
    countryId: string
    vendorTypeId: string
  }, documentTypeId: string) {
    const allowed = await this.getAllowedTypes(application)

    const match = allowed.find(type => type.id === documentTypeId)

    if (!match) {
      return {
        ok: false as const,
        message: "Invalid document type for this application",
      }
    }

    return { ok: true as const }
  },

  async getRequirementsWithStatus(application: {
    id: string
    countryId: string
    vendorTypeId: string
  }) {
    const [allowedTypes, uploadedDocs] = await Promise.all([
      this.getAllowedTypes(application),
      prisma.vendorDocument.findMany({
        where: {
          applicationId: application.id,
          status: {
            in: [DocumentStatus.PENDING, DocumentStatus.APPROVED],
          },
        },
      }),
    ])

    const uploadedMap = new Map(
      uploadedDocs.map(doc => [doc.documentTypeId, doc])
    )

    return allowedTypes.map(type => {
      const config = type.vendorTypeConfigs[0]

      const uploaded = uploadedMap.get(type.id)

      return {
        documentTypeId: type.id,
        name: type.name,
        isRequired: config?.isRequired ?? false,
        uploaded: !!uploaded,
        uploadedDocument: uploaded ?? null,
      }
    })
  },

  async validateApplicationSubmission(application: {
    id: string
    countryId: string
    vendorTypeId: string
  }) {
    const requirements = await this.getRequirementsWithStatus(application)

    const missing = requirements.filter(
      r => r.isRequired && !r.uploaded
    )

    if (missing.length > 0) {
      return {
        ok: false as const,
        message: "Missing required documents",
        missingDocuments: missing.map(d => d.name),
      }
    }

    return { ok: true as const }
  },

  async getUploadProgress(application: {
    id: string
    countryId: string
    vendorTypeId: string
  }) {
    const requirements = await this.getRequirementsWithStatus(application)

    const required = requirements.filter(r => r.isRequired)
    const uploadedRequired = required.filter(r => r.uploaded)

    return {
      requiredTotal: required.length,
      uploadedRequired: uploadedRequired.length,
      uploadedTotal: requirements.filter(r => r.uploaded).length,
      isComplete: uploadedRequired.length === required.length,
      percentage:
        required.length === 0
          ? 100
          : Math.round(
              (uploadedRequired.length / required.length) * 100
            ),
    }
  },
}
