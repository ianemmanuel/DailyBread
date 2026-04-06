import { createClerkClient }       from "@clerk/backend"
import { prisma, AdminUserStatus } from "@repo/db"
import { ApiError }                from "@/middleware/error"

// ─── Input types ──────────────────────────────────────────────────────────────
//
// These are internal to this service — only called by the admin user controller.
// They don't cross app/package boundaries so they live here, not in @repo/types.

interface CreateAdminUserInput {
  email          : string
  fullName       : string
  roleId         : string
  permissionKeys : string[]
}

interface SendInviteInput {
  adminUserId: string
}

interface UpdateAdminUserPermissionsInput {
  adminUserId    : string
  permissionKeys : string[]
}

// ─── Clerk client ─────────────────────────────────────────────────────────────

function getAdminClerkClient() {
  const secretKey = process.env.CLERK_ADMIN_SECRET_KEY
  if (!secretKey) {
    throw new ApiError(500, "CLERK_ADMIN_SECRET_KEY is not configured", "CLERK_MISCONFIGURED")
  }
  return createClerkClient({ secretKey })
}

// ─── Create admin user ────────────────────────────────────────────────────────

export async function createAdminUser(
  input  : CreateAdminUserInput,
  actorId: string,
) {
  const { email, fullName, roleId, permissionKeys } = input
  const normalizedEmail = email.toLowerCase().trim()

  const existing = await prisma.adminUser.findUnique({ where: { email: normalizedEmail } })
  if (existing) throw new ApiError(409, "An admin user with this email already exists", "DUPLICATE_EMAIL")

  const role = await prisma.adminRole.findUnique({ where: { id: roleId } })
  if (!role) throw new ApiError(404, "Role not found", "ROLE_NOT_FOUND")

  if (permissionKeys.length > 0) {
    await validatePermissionsInRolePool(roleId, permissionKeys)
  }

  return prisma.$transaction(async (tx) => {
    const user = await tx.adminUser.create({
      data: {
        email       : normalizedEmail,
        fullName,
        roleId,
        status      : AdminUserStatus.pending,
        isActive    : false,
        invitedById : actorId,
      },
    })

    if (permissionKeys.length > 0) {
      const permissions = await tx.adminPermission.findMany({
        where: { key: { in: permissionKeys }, isActive: true },
      })

      await tx.adminUserPermission.createMany({
        data: permissions.map((p) => ({
          adminUserId : user.id,   // ← Prisma field name (not userId)
          permissionId: p.id,
          grantedById : actorId,
        })),
      })
    }

    return user
  })
}

// ─── Send Clerk invitation ────────────────────────────────────────────────────

export async function sendAdminInvitation(input: SendInviteInput, actorId: string) {
  const adminUser = await prisma.adminUser.findUnique({ where: { id: input.adminUserId } })
  if (!adminUser) throw new ApiError(404, "Admin user not found", "USER_NOT_FOUND")

  if (
    adminUser.status !== AdminUserStatus.pending &&
    adminUser.status !== AdminUserStatus.invited
  ) {
    throw new ApiError(
      400,
      `Cannot send invitation to a user with status: ${adminUser.status}`,
      "INVALID_STATUS",
    )
  }

  const clerk = getAdminClerkClient()

  try {
    await clerk.invitations.createInvitation({
      emailAddress  : adminUser.email,
      redirectUrl   : process.env.CLERK_ADMIN_INVITE_REDIRECT_URL,
      publicMetadata: { adminUserId: adminUser.id, role: adminUser.roleId },
    })
  } catch (err) {
    throw new ApiError(502, `Failed to send Clerk invitation: ${(err as Error).message}`, "CLERK_ERROR")
  }

  await prisma.adminUser.update({
    where: { id: input.adminUserId },
    data : {
      status              : AdminUserStatus.invited,
      invitationSentAt    : new Date(),
      invitationSentCount : { increment: 1 },
    },
  })

  return { success: true }
}

// ─── Update permissions ───────────────────────────────────────────────────────

export async function updateAdminUserPermissions(
  input  : UpdateAdminUserPermissionsInput,
  actorId: string,
) {
  const { adminUserId, permissionKeys } = input

  const adminUser = await prisma.adminUser.findUnique({
    where  : { id: adminUserId },
    include: { role: true },
  })
  if (!adminUser) throw new ApiError(404, "Admin user not found", "USER_NOT_FOUND")
  if (!adminUser.roleId) throw new ApiError(400, "User has no role assigned", "NO_ROLE")

  if (permissionKeys.length > 0) {
    await validatePermissionsInRolePool(adminUser.roleId, permissionKeys)
  }

  const permissions = await prisma.adminPermission.findMany({
    where: { key: { in: permissionKeys }, isActive: true },
  })

  await prisma.$transaction([
    prisma.adminUserPermission.deleteMany({
      where: { adminUserId },           // ← Prisma field name
    }),
    prisma.adminUserPermission.createMany({
      data: permissions.map((p) => ({
        adminUserId,                    // ← Prisma field name
        permissionId: p.id,
        grantedById : actorId,
      })),
    }),
  ])

  return { updated: permissions.length }
}

// ─── Suspend ──────────────────────────────────────────────────────────────────

export async function suspendAdminUser(
  adminUserId: string,
  reason     : string,
  actorId    : string,
) {
  const user = await prisma.adminUser.findUnique({ where: { id: adminUserId } })
  if (!user) throw new ApiError(404, "Admin user not found", "USER_NOT_FOUND")

  if (user.status === AdminUserStatus.suspended) {
    throw new ApiError(400, "User is already suspended", "ALREADY_SUSPENDED")
  }
  if (user.status === AdminUserStatus.deactivated) {
    throw new ApiError(400, "Cannot suspend a deactivated user", "INVALID_STATUS")
  }
  if (user.status === AdminUserStatus.pending || user.status === AdminUserStatus.invited) {
    throw new ApiError(400, "Cannot suspend a user who has not yet activated their account", "INVALID_STATUS")
  }

  if (user.clerkUserId) {
    try {
      const clerk = getAdminClerkClient()
      await clerk.users.banUser(user.clerkUserId)
    } catch (err) {
      throw new ApiError(502, `Failed to ban Clerk user: ${(err as Error).message}`, "CLERK_ERROR")
    }
  }

  await prisma.adminUser.update({
    where: { id: adminUserId },
    data : {
      status            : AdminUserStatus.suspended,
      isActive          : false,
      deactivationReason: reason,
    },
  })

  return { success: true }
}

// ─── Reinstate ────────────────────────────────────────────────────────────────

export async function reinstateAdminUser(adminUserId: string, actorId: string) {
  const user = await prisma.adminUser.findUnique({ where: { id: adminUserId } })
  if (!user) throw new ApiError(404, "Admin user not found", "USER_NOT_FOUND")

  if (user.status !== AdminUserStatus.suspended) {
    throw new ApiError(400, "Only suspended users can be reinstated", "INVALID_STATUS")
  }

  if (user.clerkUserId) {
    try {
      const clerk = getAdminClerkClient()
      await clerk.users.unbanUser(user.clerkUserId)
    } catch (err) {
      throw new ApiError(502, `Failed to unban Clerk user: ${(err as Error).message}`, "CLERK_ERROR")
    }
  }

  await prisma.adminUser.update({
    where: { id: adminUserId },
    data : {
      status            : AdminUserStatus.active,
      isActive          : true,
      deactivationReason: null,
    },
  })

  return { success: true }
}

// ─── Deactivate ───────────────────────────────────────────────────────────────

export async function deactivateAdminUser(
  adminUserId: string,
  reason     : string,
  actorId    : string,
) {
  const user = await prisma.adminUser.findUnique({ where: { id: adminUserId } })
  if (!user) throw new ApiError(404, "Admin user not found", "USER_NOT_FOUND")

  if (user.status === AdminUserStatus.deactivated) {
    throw new ApiError(400, "User is already deactivated", "ALREADY_DEACTIVATED")
  }

  if (user.clerkUserId) {
    try {
      const clerk = getAdminClerkClient()
      await clerk.users.deleteUser(user.clerkUserId)
    } catch (err) {
      // Log but don't throw — DB deactivation must succeed regardless
      console.error(`[admin-user] Failed to delete Clerk user ${user.clerkUserId}:`, err)
    }
  }

  await prisma.adminUser.update({
    where: { id: adminUserId },
    data : {
      status            : AdminUserStatus.deactivated,
      isActive          : false,
      deactivatedAt     : new Date(),
      deactivationReason: reason,
      clerkUserId       : null,
    },
  })

  return { success: true }
}

// ─── Get one ──────────────────────────────────────────────────────────────────

export async function getAdminUser(adminUserId: string) {
  const user = await prisma.adminUser.findUnique({
    where  : { id: adminUserId },
    include: {
      role       : true,
      permissions: { include: { permission: true } },
    },
  })
  if (!user) throw new ApiError(404, "Admin user not found", "USER_NOT_FOUND")
  return user
}

// ─── List ─────────────────────────────────────────────────────────────────────

export async function listAdminUsers(filters: {
  status?  : AdminUserStatus
  roleId?  : string
  page?    : number
  pageSize?: number
}) {
  const { status, roleId, page = 1, pageSize = 20 } = filters
  const skip  = (page - 1) * pageSize
  const where = {
    ...(status ? { status } : {}),
    ...(roleId ? { roleId } : {}),
  }

  const [users, total] = await Promise.all([
    prisma.adminUser.findMany({
      where,
      skip,
      take   : pageSize,
      orderBy: { createdAt: "desc" },
      include: { role: true },
    }),
    prisma.adminUser.count({ where }),
  ])

  return { users, total, page, pageSize, totalPages: Math.ceil(total / pageSize) }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function validatePermissionsInRolePool(roleId: string, permissionKeys: string[]) {
  const rolePermissions = await prisma.adminRolePermission.findMany({
    where  : { roleId },
    include: { permission: true },
  })

  const poolKeys  = new Set(rolePermissions.map((rp) => rp.permission.key))
  const outOfPool = permissionKeys.filter((k) => !poolKeys.has(k))

  if (outOfPool.length > 0) {
    throw new ApiError(
      400,
      `The following permissions are not in this role's pool: ${outOfPool.join(", ")}`,
      "PERMISSIONS_OUT_OF_POOL",
    )
  }
}