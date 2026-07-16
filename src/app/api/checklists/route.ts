import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { RECURRENCE_OPTIONS } from '@/lib/recurrence'
import { checklistAccessWhere } from '@/lib/access'
import {
  createChecklistFromTemplate,
  getChecklistInclude,
  generateRemindersForChecklist,
  collectReminderUserIds,
} from '@/lib/checklist-helpers'
import { logActivity } from '@/lib/activity'
import { notify } from '@/lib/notifications'

const PAGE_SIZE = 50

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const category = searchParams.get('category')
  const assignedToId = searchParams.get('assignedTo')
  const search = searchParams.get('q')?.trim()
  const visibility = searchParams.get('visibility')
  // Any checklist a given user is involved in (created, assigned list or item).
  const userId = searchParams.get('user')
  const page = Math.max(1, Number(searchParams.get('page')) || 1)
  const paginated = searchParams.has('page')

  const where = {
    AND: [
      checklistAccessWhere(session.user.id, session.user.role, session.user.organizationId),
      {
        ...(status ? { status } : {}),
        ...(category ? { category } : {}),
        ...(assignedToId ? { assignedToId } : {}),
        ...(search ? { title: { contains: search } } : {}),
        ...(visibility ? { visibility } : {}),
        ...(userId
          ? {
              OR: [
                { createdById: userId },
                { assignedToId: userId },
                { items: { some: { assignedToId: userId } } },
              ],
            }
          : {}),
      },
    ],
  }

  const orderBy =
    status === 'completed'
      ? [{ completedAt: 'desc' as const }]
      : [{ status: 'asc' as const }, { dueDate: 'asc' as const }, { createdAt: 'desc' as const }]

  const [checklists, total] = await Promise.all([
    prisma.checklist.findMany({
      where,
      include: getChecklistInclude(),
      orderBy,
      ...(paginated ? { skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE } : {}),
    }),
    prisma.checklist.count({ where }),
  ])
  return NextResponse.json({ checklists, total, page, pageSize: PAGE_SIZE })
}

const fromTemplateSchema = z.object({
  templateId: z.string().min(1),
  title: z.string().trim().max(200).optional(),
  dueDate: z.iso.datetime().nullish(),
  assignedToId: z.string().nullish(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  visibility: z.enum(['team', 'private', 'department']).optional(),
  departmentIds: z.array(z.string().min(1)).max(50).default([]),
  reminderOffsetHours: z.number().int().nullish(),
})

const adHocSchema = z.object({
  templateId: z.undefined().optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).default(''),
  category: z.string().trim().max(100).default('general'),
  recurrence: z.enum(RECURRENCE_OPTIONS).default('none'),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  visibility: z.enum(['team', 'private', 'department']).default('team'),
  departmentIds: z.array(z.string().min(1)).max(50).default([]),
  dueDate: z.iso.datetime().nullish(),
  assignedToId: z.string().nullish(),
  reminderOffsetHours: z.number().int().nullish(),
  items: z.array(z.object({ text: z.string().trim().min(1).max(500) })).default([]),
})

/**
 * Cross-org guardrails for create input: the assignee must be a member of
 * the caller's organisation, and department visibility must name at least
 * one department that all belong to it. Returns an error message or null.
 */
async function validateCreateRefs(
  organizationId: string,
  assignedToId: string | null | undefined,
  visibility: string | undefined,
  departmentIds: string[]
): Promise<string | null> {
  if (assignedToId) {
    const assignee = await prisma.user.findFirst({
      where: { id: assignedToId, organizationId },
      select: { id: true },
    })
    if (!assignee) return 'Assignee not found'
  }
  if (visibility === 'department') {
    if (departmentIds.length === 0) return 'Choose at least one department'
    const count = await prisma.department.count({
      where: { id: { in: departmentIds }, organizationId },
    })
    if (count !== departmentIds.length) return 'Department not found'
  }
  return null
}

// Create a checklist: from a template (master untouched) or ad hoc.
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  if ('templateId' in body && body.templateId) {
    const parsed = fromTemplateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
    }
    const refError = await validateCreateRefs(
      session.user.organizationId,
      parsed.data.assignedToId,
      parsed.data.visibility,
      parsed.data.departmentIds
    )
    if (refError) {
      return NextResponse.json({ error: refError }, { status: 400 })
    }
    const checklist = await createChecklistFromTemplate({
      templateId: parsed.data.templateId,
      organizationId: session.user.organizationId,
      createdById: session.user.id,
      title: parsed.data.title,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      assignedToId: parsed.data.assignedToId ?? null,
      priority: parsed.data.priority,
      visibility: parsed.data.visibility,
      departmentIds: parsed.data.visibility === 'department' ? parsed.data.departmentIds : [],
      reminderOffsetHours: parsed.data.reminderOffsetHours ?? null,
    })
    if (!checklist) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }
    logActivity(checklist.id, session.user.name, 'created', 'from template')

    // Generate reminder if offset is set
    const userIds = await collectReminderUserIds(checklist.id)
    generateRemindersForChecklist(
      checklist.id,
      checklist.dueDate,
      checklist.reminderOffsetHours ?? null,
      userIds
    ).catch((err) => console.error('Reminder generation failed:', err))

    return NextResponse.json({ checklist }, { status: 201 })
  }

  const parsed = adHocSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }
  const data = parsed.data
  const refError = await validateCreateRefs(
    session.user.organizationId,
    data.assignedToId,
    data.visibility,
    data.departmentIds
  )
  if (refError) {
    return NextResponse.json({ error: refError }, { status: 400 })
  }
  const checklist = await prisma.checklist.create({
    data: {
      title: data.title,
      description: data.description,
      category: data.category || 'general',
      recurrence: data.recurrence,
      priority: data.priority,
      visibility: data.visibility,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      reminderOffsetHours: data.reminderOffsetHours ?? null,
      organizationId: session.user.organizationId,
      createdById: session.user.id,
      assignedToId: data.assignedToId ?? null,
      items: {
        create: data.items.map((item, idx) => ({ text: item.text, sortOrder: idx })),
      },
      ...(data.visibility === 'department' && data.departmentIds.length > 0
        ? { departments: { create: data.departmentIds.map((departmentId) => ({ departmentId })) } }
        : {}),
    },
    include: getChecklistInclude(),
  })

  logActivity(checklist.id, session.user.name, 'created')

  // Generate reminder if offset is set
  const userIds = await collectReminderUserIds(checklist.id)
  generateRemindersForChecklist(
    checklist.id,
    checklist.dueDate,
    checklist.reminderOffsetHours ?? null,
    userIds
  ).catch((err) => console.error('Reminder generation failed:', err))

  if (checklist.assignedToId && checklist.assignedToId !== session.user.id) {
    await notify(
      checklist.assignedToId,
      'New checklist assigned',
      `You have been assigned "${checklist.title}".`,
      checklist.id
    )
  }

  return NextResponse.json({ checklist }, { status: 201 })
}
