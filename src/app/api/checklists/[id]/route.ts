import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { RECURRENCE_OPTIONS } from '@/lib/recurrence'
import { canAccessChecklist, canManageChecklist, checklistAccessWhere } from '@/lib/access'
import { completeChecklist, getChecklistInclude } from '@/lib/checklist-helpers'
import { notify } from '@/lib/notifications'
import { logActivity } from '@/lib/activity'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const checklist = await prisma.checklist.findFirst({
    where: { id, ...checklistAccessWhere(session.user.id, session.user.role) },
    include: getChecklistInclude(),
  })
  if (!checklist) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json({ checklist })
}

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  category: z.string().trim().max(100).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  recurrence: z.enum(RECURRENCE_OPTIONS).optional(),
  dueDate: z.iso.datetime().nullish(),
  assignedToId: z.string().nullish(),
  status: z.enum(['active', 'completed']).optional(),
  visibility: z.enum(['team', 'private']).optional(),
  sharedUserIds: z.array(z.string().min(1)).max(100).optional(),
  fieldValues: z
    .array(z.object({ id: z.string().min(1), value: z.string().max(2000) }))
    .optional(),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const existing = await prisma.checklist.findFirst({
    where: { id, ...checklistAccessWhere(session.user.id, session.user.role) },
    select: { id: true, status: true, assignedToId: true, title: true },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { status, fieldValues, dueDate, assignedToId, visibility, sharedUserIds, ...scalars } =
    parsed.data

  // Visibility and sharing are managed by the creator, managers and admins.
  if (visibility !== undefined || sharedUserIds !== undefined) {
    const allowed = await canManageChecklist(id, session.user.id, session.user.role)
    if (!allowed) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const data: Record<string, unknown> = { ...scalars }
  if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null
  if (assignedToId !== undefined) data.assignedToId = assignedToId ?? null
  if (visibility !== undefined) data.visibility = visibility
  if (status === 'active' && existing.status === 'completed') {
    data.status = 'active'
    data.completedAt = null
  }

  if (fieldValues) {
    // Scope updates to this checklist's own field values.
    for (const fv of fieldValues) {
      await prisma.customFieldValue.updateMany({
        where: { id: fv.id, checklistId: id },
        data: { value: fv.value },
      })
    }
  }

  if (sharedUserIds !== undefined) {
    const previous = await prisma.checklistShare.findMany({
      where: { checklistId: id },
      select: { userId: true },
    })
    const validUsers = await prisma.user.findMany({
      where: { id: { in: sharedUserIds } },
      select: { id: true },
    })
    const wanted = validUsers.map((u) => u.id).filter((uid) => uid !== session.user.id)
    await prisma.$transaction([
      prisma.checklistShare.deleteMany({ where: { checklistId: id } }),
      prisma.checklistShare.createMany({
        data: wanted.map((userId) => ({ checklistId: id, userId })),
      }),
    ])
    const previousIds = new Set(previous.map((s) => s.userId))
    for (const userId of wanted) {
      if (!previousIds.has(userId)) {
        await notify(
          userId,
          'Checklist shared with you',
          `${session.user.name} shared "${scalars.title ?? existing.title}" with you.`,
          id
        )
      }
    }
  }

  await prisma.checklist.update({ where: { id }, data })

  // Completion goes through the shared funnel so recurrence spawns exactly once.
  if (status === 'completed' && existing.status !== 'completed') {
    await completeChecklist(id)
    logActivity(id, session.user.name, 'completed')
  } else if (status === 'active' && existing.status === 'completed') {
    logActivity(id, session.user.name, 'reopened')
  }

  if (visibility !== undefined) {
    logActivity(id, session.user.name, 'visibility_changed', `now ${visibility}`)
  }
  if (sharedUserIds !== undefined) {
    logActivity(id, session.user.name, 'shared', 'sharing updated')
  }
  if (
    Object.keys(scalars).length > 0 ||
    dueDate !== undefined ||
    fieldValues !== undefined
  ) {
    logActivity(id, session.user.name, 'edited')
  }

  // Notify a newly assigned user.
  if (
    assignedToId &&
    assignedToId !== existing.assignedToId &&
    assignedToId !== session.user.id
  ) {
    await notify(
      assignedToId,
      'Checklist assigned to you',
      `You have been assigned "${scalars.title ?? existing.title}".`,
      id
    )
  }
  if (assignedToId !== undefined && assignedToId !== existing.assignedToId) {
    const assignee = assignedToId
      ? await prisma.user.findUnique({ where: { id: assignedToId }, select: { name: true } })
      : null
    logActivity(
      id,
      session.user.name,
      'assigned',
      assignee ? `to ${assignee.name}` : 'unassigned'
    )
  }

  const checklist = await prisma.checklist.findUnique({
    where: { id },
    include: getChecklistInclude(),
  })
  return NextResponse.json({ checklist })
}

// Creator, manager or admin only — a shared viewer must not be able to
// delete the team's records.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const canView = await canAccessChecklist(id, session.user.id, session.user.role)
  if (!canView) {
    return NextResponse.json({ ok: true }) // hidden lists 404 the same as missing ones
  }
  const allowed = await canManageChecklist(id, session.user.id, session.user.role)
  if (!allowed) {
    return NextResponse.json({ error: 'Only the creator or a manager can delete this' }, { status: 403 })
  }
  await prisma.checklist.delete({ where: { id } }).catch(() => null)
  return NextResponse.json({ ok: true })
}
