import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { RECURRENCE_OPTIONS } from '@/lib/recurrence'
import { completeChecklist, getChecklistInclude } from '@/lib/checklist-helpers'
import { notify } from '@/lib/notifications'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const checklist = await prisma.checklist.findUnique({
    where: { id },
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

  const existing = await prisma.checklist.findUnique({
    where: { id },
    select: { id: true, status: true, assignedToId: true, title: true },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { status, fieldValues, dueDate, assignedToId, ...scalars } = parsed.data

  const data: Record<string, unknown> = { ...scalars }
  if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null
  if (assignedToId !== undefined) data.assignedToId = assignedToId ?? null
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

  await prisma.checklist.update({ where: { id }, data })

  // Completion goes through the shared funnel so recurrence spawns exactly once.
  if (status === 'completed' && existing.status !== 'completed') {
    await completeChecklist(id)
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

  const checklist = await prisma.checklist.findUnique({
    where: { id },
    include: getChecklistInclude(),
  })
  return NextResponse.json({ checklist })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  await prisma.checklist.delete({ where: { id } }).catch(() => null)
  return NextResponse.json({ ok: true })
}
