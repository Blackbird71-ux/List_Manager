import { prisma } from '@/lib/prisma'

// Managers and admins can see every checklist in their organisation,
// including private ones.
export function canSeeAllChecklists(role: string) {
  return role === 'admin' || role === 'manager'
}

/**
 * Instance-level settings (SMTP, remote-access tunnel) are shared by every
 * organisation on this install, so only admins of the primary organisation
 * may read or change them.
 */
export async function isPrimaryOrgAdmin(role: string, organizationId: string) {
  if (role !== 'admin' || !organizationId) return false
  const org = await prisma.organization.findFirst({
    where: { id: organizationId, isPrimary: true },
    select: { id: true },
  })
  return Boolean(org)
}

/**
 * Prisma where-fragment limiting checklists to what this user may see,
 * always within their own organisation: team lists, department lists for
 * departments they belong to, their own, ones assigned to them (list or
 * item level), and ones explicitly shared with them. Managers/admins see
 * everything in the organisation.
 */
export function checklistAccessWhere(userId: string, role: string, organizationId: string) {
  if (!organizationId) {
    // Never widen a query because the org is missing from the session.
    throw new Error('Missing organizationId')
  }
  if (canSeeAllChecklists(role)) return { organizationId }
  return {
    organizationId,
    OR: [
      { visibility: 'team' },
      {
        visibility: 'department',
        departments: { some: { department: { members: { some: { userId } } } } },
      },
      { createdById: userId },
      { assignedToId: userId },
      { shares: { some: { userId } } },
      { items: { some: { assignedToId: userId } } },
    ],
  }
}

/** True if the user may open and work on this checklist. */
export async function canAccessChecklist(
  checklistId: string,
  userId: string,
  role: string,
  organizationId: string
) {
  const found = await prisma.checklist.findFirst({
    where: { id: checklistId, ...checklistAccessWhere(userId, role, organizationId) },
    select: { id: true },
  })
  return Boolean(found)
}

/**
 * True if the user may manage a checklist (delete it, change its
 * visibility or sharing): creator, or a manager/admin of the same org.
 */
export async function canManageChecklist(
  checklistId: string,
  userId: string,
  role: string,
  organizationId: string
) {
  const found = await prisma.checklist.findFirst({
    where: canSeeAllChecklists(role)
      ? { id: checklistId, organizationId }
      : { id: checklistId, organizationId, createdById: userId },
    select: { id: true },
  })
  return Boolean(found)
}
