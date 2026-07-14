import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { RECURRENCE_OPTIONS } from '@/lib/recurrence'
import { createChecklistFromTemplate, getChecklistInclude } from '@/lib/checklist-helpers'
import { notify } from '@/lib/notifications'

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

  const checklists = await prisma.checklist.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(category ? { category } : {}),
      ...(assignedToId ? { assignedToId } : {}),
      ...(search ? { title: { contains: search } } : {}),
    },
    include: getChecklistInclude(),
    orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
  })
  return NextResponse.json({ checklists })
}

const fromTemplateSchema = z.object({
  templateId: z.string().min(1),
  title: z.string().trim().max(200).optional(),
  dueDate: z.iso.datetime().nullish(),
  assignedToId: z.string().nullish(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
})

const adHocSchema = z.object({
  templateId: z.undefined().optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).default(''),
  category: z.string().trim().max(100).default('general'),
  recurrence: z.enum(RECURRENCE_OPTIONS).default('none'),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  dueDate: z.iso.datetime().nullish(),
  assignedToId: z.string().nullish(),
  items: z.array(z.object({ text: z.string().trim().min(1).max(500) })).default([]),
})

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
    const checklist = await createChecklistFromTemplate({
      templateId: parsed.data.templateId,
      createdById: session.user.id,
      title: parsed.data.title,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      assignedToId: parsed.data.assignedToId ?? null,
      priority: parsed.data.priority,
    })
    if (!checklist) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }
    return NextResponse.json({ checklist }, { status: 201 })
  }

  const parsed = adHocSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }
  const data = parsed.data
  const checklist = await prisma.checklist.create({
    data: {
      title: data.title,
      description: data.description,
      category: data.category || 'general',
      recurrence: data.recurrence,
      priority: data.priority,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      createdById: session.user.id,
      assignedToId: data.assignedToId ?? null,
      items: {
        create: data.items.map((item, idx) => ({ text: item.text, sortOrder: idx })),
      },
    },
    include: getChecklistInclude(),
  })

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
