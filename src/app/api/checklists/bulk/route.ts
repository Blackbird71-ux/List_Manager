import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessChecklist, canManageChecklist, checklistAccessWhere } from '@/lib/access'
import { logActivity } from '@/lib/activity'
import { completeChecklist } from '@/lib/checklist-helpers'

const BULK_ACTIONS = ['assign', 'priority', 'dueDate', 'complete', 'delete'] as const

const bulkActionSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
  action: z.enum(BULK_ACTIONS),
  data: z.object({
    assignedToId: z.string().optional(),
    priority: z.enum(['low', 'medium', 'high']).optional(),
    dueDate: z.string().optional(),
  }).optional(),
})

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const parsed = bulkActionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.issues }, { status: 400 })
  }

  const { ids, action, data } = parsed.data
  const { role, organizationId } = session.user

  // Fetch all checklists the user has access to (within their org)
  const accessibleWhere = {
    id: { in: ids },
    ...checklistAccessWhere(session.user.id, role, organizationId),
  }
  const accessible = await prisma.checklist.findMany({
    where: accessibleWhere,
    select: { id: true, title: true, status: true },
  })

  const accessibleIds = new Set(accessible.map((c) => c.id))
  const failed = ids.filter((id) => !accessibleIds.has(id))
  const accessibleChecklists = accessible

  let success = 0

  for (const cl of accessibleChecklists) {
    try {
      switch (action) {
        case 'assign': {
          if (!data?.assignedToId) continue
          // Validate assignee is in same org
          const assignee = await prisma.user.findFirst({
            where: { id: data.assignedToId, organizationId },
            select: { id: true },
          })
          if (!assignee) {
            failed.push(cl.id)
            continue
          }
          await prisma.checklist.update({
            where: { id: cl.id },
            data: { assignedToId: data.assignedToId },
          })
          logActivity(cl.id, session.user.name, 'assigned', `Bulk reassigned to ${assignee.id}`)
          success++
          break
        }

        case 'priority': {
          if (!data?.priority) continue
          await prisma.checklist.update({
            where: { id: cl.id },
            data: { priority: data.priority },
          })
          logActivity(cl.id, session.user.name, 'edited', `Bulk priority changed to ${data.priority}`)
          success++
          break
        }

        case 'dueDate': {
          if (!data?.dueDate) continue
          await prisma.checklist.update({
            where: { id: cl.id },
            data: { dueDate: new Date(data.dueDate) },
          })
          logActivity(cl.id, session.user.name, 'edited', `Bulk due date changed`)
          success++
          break
        }

        case 'complete': {
          // Only admin/manager can bulk complete
          if (role !== 'admin' && role !== 'manager') {
            failed.push(cl.id)
            continue
          }
          if (cl.status === 'completed') continue // already done
          await prisma.checklist.update({
            where: { id: cl.id },
            data: { status: 'completed', completedAt: new Date() },
          })
          logActivity(cl.id, session.user.name, 'completed', 'Bulk completed')
          success++
          break
        }

        case 'delete': {
          // Only admin/manager can bulk delete, and only if they manage the checklist
          if (role !== 'admin' && role !== 'manager') {
            failed.push(cl.id)
            continue
          }
          const canManage = await canManageChecklist(cl.id, session.user.id, role, organizationId)
          if (!canManage) {
            failed.push(cl.id)
            continue
          }
          await prisma.checklist.delete({ where: { id: cl.id } })
          success++
          break
        }
      }
    } catch {
      failed.push(cl.id)
    }
  }

  return NextResponse.json({ success, failed })
}
