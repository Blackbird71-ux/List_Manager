import { prisma } from '@/lib/prisma'

// Managers and admins can see every checklist, including private ones.
export function canSeeAllChecklists(role: string) {
  return role === 'admin' || role === 'manager'
}

/**
 * Prisma where-fragment limiting checklists to what this user may see:
 * team lists, their own, ones assigned to them (list or item level), and
 * ones explicitly shared with them. Managers/admins see everything.
 */
export function checklistAccessWhere(userId: string, role: string) {
  if (canSeeAllChecklists(role)) return {}
  return {
    OR: [
      { visibility: 'team' },
      { createdById: userId },
      { assignedToId: userId },
      { shares: { some: { userId } } },
      { items: { some: { assignedToId: userId } } },
    ],
  }
}

/** True if the user may open and work on this checklist. */
export async function canAccessChecklist(checklistId: string, userId: string, role: string) {
  const found = await prisma.checklist.findFirst({
    where: { id: checklistId, ...checklistAccessWhere(userId, role) },
    select: { id: true },
  })
  return Boolean(found)
}

/**
 * True if the user may manage a checklist (delete it, change its
 * visibility or sharing): creator, manager or admin.
 */
export async function canManageChecklist(checklistId: string, userId: string, role: string) {
  if (canSeeAllChecklists(role)) return true
  const found = await prisma.checklist.findFirst({
    where: { id: checklistId, createdById: userId },
    select: { id: true },
  })
  return Boolean(found)
}
