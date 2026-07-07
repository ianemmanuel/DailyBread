import { prisma } from '../../index'
import { PERMISSIONS } from './data/permissions.data'

export async function seedPermissions(): Promise<number> {
  for (const perm of PERMISSIONS) {
    await prisma.adminPermission.upsert({
      where : { key: perm.key },
      update: { module: perm.module, description: perm.description },
      create: { ...perm, isActive: true },
    })
  }
  return PERMISSIONS.length
}