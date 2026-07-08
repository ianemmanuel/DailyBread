import { prisma } from '../../index'
import { SYSTEM_USER_ID } from '../../constants'
import { SYSTEM_USER_EMAIL } from './data/system-data'

// Not a real person, never logs in, has no clerkUserId and never will.
// Exists only so automated writes (cron jobs, background flags) have a
// valid AdminUser row to satisfy required foreign keys like
// AuditLog.adminUserId and AdminUserPermission.grantedById.
export async function seedSystemUser(): Promise<void> {
  await prisma.adminUser.upsert({
    where : { id: SYSTEM_USER_ID },
    update: {},
    create: {
      id       : SYSTEM_USER_ID,
      email    : SYSTEM_USER_EMAIL,
      firstName: "System",
      lastName : "Automated",
      status   : "deactivated", // never invited, never active — exclude by id in any admin-facing user list
      isActive : false,
    },
  })
}