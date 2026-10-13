import { AdminPermissionSetupStatus, type Prisma } from "@repo/db"

/*
 * The AdminPermissionSetup row's transitions. Each runs inside the
 * transaction of the write that causes it (invitation, grant, role/scope
 * change, deactivation, reactivation), so the task can never disagree with
 * the account. Every transition is conditional on the state it moves from,
 * which makes retries and concurrent writers harmless.
 */

type Db = Prisma.TransactionClient

const { PENDING, COMPLETED, CANCELLED } = AdminPermissionSetupStatus

const reopened = () => ({ status: PENDING, openedAt: new Date(), resolvedAt: null, resolvedById: null })

/** An invitation was sent: open the setup if the account still holds no grants. Idempotent across resends. */
export async function openPermissionSetup(db: Db, adminUserId: string): Promise<void> {
  if (await db.adminUserPermission.count({ where: { adminUserId } }) > 0) return
  await db.adminPermissionSetup.createMany({ data: [{ adminUserId }], skipDuplicates: true })
  await db.adminPermissionSetup.updateMany({ where: { adminUserId, status: CANCELLED }, data: reopened() })
}

/** A non-empty grant was saved: the first one completes the setup. */
export async function completePermissionSetup(db: Db, adminUserId: string, actorId: string): Promise<void> {
  await db.adminPermissionSetup.updateMany({
    where: { adminUserId, status: PENDING },
    data : { status: COMPLETED, resolvedAt: new Date(), resolvedById: actorId },
  })
}

/** A role or scope change cleared the grants of an invited account: it needs setting up again. */
export async function reopenPermissionSetup(db: Db, adminUserId: string): Promise<void> {
  await db.adminPermissionSetup.updateMany({ where: { adminUserId, status: COMPLETED }, data: reopened() })
}

export async function cancelPermissionSetup(db: Db, adminUserId: string, actorId: string): Promise<void> {
  await db.adminPermissionSetup.updateMany({
    where: { adminUserId, status: PENDING },
    data : { status: CANCELLED, resolvedAt: new Date(), resolvedById: actorId },
  })
}

/** Reactivation starts a new cycle: the next invitation opens a fresh setup. */
export async function resetPermissionSetup(db: Db, adminUserId: string): Promise<void> {
  await db.adminPermissionSetup.deleteMany({ where: { adminUserId } })
}
