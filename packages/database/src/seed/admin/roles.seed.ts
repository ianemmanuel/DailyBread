import { prisma } from '../../index'
import { ROLES } from './data/roles.data'

export async function seedRoles(): Promise<number> {
  for (const role of ROLES) {
    await prisma.adminRole.upsert({
      where : { name: role.name },
      update: { displayName: role.displayName, description: role.description },
      create: role,
    })
  }
  return ROLES.length
}