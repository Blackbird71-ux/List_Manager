import { prisma } from '@/lib/prisma'

/**
 * Fire-and-forget audit trail entry. A logging failure must never break
 * the request that triggered it, so errors are swallowed.
 */
export function logActivity(
  checklistId: string,
  actorName: string,
  action: string,
  detail = ''
): void {
  prisma.activityLog
    .create({ data: { checklistId, actorName, action, detail } })
    .catch(() => {})
}
