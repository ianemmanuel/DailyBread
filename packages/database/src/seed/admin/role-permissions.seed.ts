import { prisma } from '../../index'
import { ROLE_POOLS } from './data/role-permissions.data'

// Depends on AdminRole and AdminPermission rows already existing —
// run this only after seedRoles() and seedPermissions() have completed.
export async function seedRolePermissions(): Promise<number> {
  let count = 0

  for (const [roleName, keys] of Object.entries(ROLE_POOLS)) {
    const role = await prisma.adminRole.findUnique({ where: { name: roleName } })
    if (!role) {
      console.warn(`🚨🚨 Role not found: ${roleName}`)
      continue
    }

    for (const key of keys) {
      const permission = await prisma.adminPermission.findUnique({ where: { key } })
      if (!permission) {
        console.warn(`⚠ Permission not found: ${key}`)
        continue
      }

      await prisma.adminRolePermission.upsert({
        where : { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      })
      count++
    }
  }

  return count
}