import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checklistAccessWhere } from '@/lib/access'
import { completeChecklist } from '@/lib/checklist-helpers'

const patchSchema = z.object({
  text: z.string().trim().min(1).max(500).optional(),
  checked: z.boolean().optional(),
  notes: z.string().max(5000).optional(),
  priority: z.enum(['low', 'medium', 'high']).nullish(),
  assignedToId: z.string().nullish(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id, itemId } = await params
  const body = await request.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const item = await prisma.checklistItem.findFirst({
    where: {
      id: itemId,
      checklistId: id,
      checklist: checklistAccessWhere(session.user.id, session.user.role),
    },
    select: { id: true, checked: true },
  })
  if (!item) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { checked, priority, assignedToId, ...scalars } = parsed.data
  const data: Record<string, unknown> = { ...scalars }
  if (priority !== undefined) data.priority = priority ?? null
  if (assignedToId !== undefined) data.assignedToId = assignedToId ?? null
  if (checked !== undefined && checked !== item.checked) {
    data.checked = checked
    data.checkedByName = checked ? session.user.name : null
    data.checkedAt = checked ? new Date() : null
  }

  const updated = await prisma.checklistItem.update({
    where: { id: itemId },
    data,
    include: {
      assignedTo: { select: { id: true, name: true, email: true } },
      attachments: {
        select: { id: true, fileName: true, mimeType: true, size: true, createdAt: true },
      },
    },
  })

  // Ticking the last box completes the list (and respawns recurring ones);
  // unticking on a completed list reopens it.
  let checklistCompleted = false
  if (checked === true) {
    const remaining = await prisma.checklistItem.count({
      where: { checklistId: id, checked: false },
    })
    if (remaining === 0) {
      await completeChecklist(id)
      checklistCompleted = true
    }
  } else if (checked === false) {
    await prisma.checklist.updateMany({
      where: { id, status: 'completed' },
      data: { status: 'active', completedAt: null },
    })
  }

  return NextResponse.json({ item: updated, checklistCompleted })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id, itemId } = await params
  await prisma.checklistItem.deleteMany({
    where: {
      id: itemId,
      checklistId: id,
      checklist: checklistAccessWhere(session.user.id, session.user.role),
    },
  })
  return NextResponse.json({ ok: true })
}
