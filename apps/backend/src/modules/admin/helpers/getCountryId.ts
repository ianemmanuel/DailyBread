import { ApiError } from "@/middleware/error"
import { 
  prisma,
} from "@repo/db"

import type { AdminScopeContext } from "@repo/types/backend"

export async function getCountryIdFromSlug(
  countrySlug: string,
  adminScope: AdminScopeContext,
): Promise<string> {
  const country = await prisma.country.findFirst({
    where: {
      slug: countrySlug,
      ...(adminScope.countryIds?.length
        ? {
            id: {
              in: adminScope.countryIds,
            },
          }
        : {}),
    },
    select: {
      id: true,
    },
  })

  if (!country) {
    throw new ApiError(
      404,
      "Country not found",
      "COUNTRY_NOT_FOUND",
    )
  }

  return country.id
}