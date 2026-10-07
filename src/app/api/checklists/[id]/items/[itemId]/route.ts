import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checklistAccessWhere } from '@/lib/access'
import { CLEAR_COMPLETION, completeChecklist, countRemainingItems } from '@/lib/checklist-helpers'
import { logActivity } from '@/lib/activity'
import { offsetDueDate } from '@/lib/conditions'
import { deleteStoredFiles, storagePathsForItem } from '@/lib/attachment-files'

const patchSchema = z.object({
  text: z.string().trim().min(1).max(500).optional(),
  checked: z.boolean().optional(),
  notes: z.string().max(5000).optional(),
  result: z.enum(['', 'pass', 'fail', 'na']).optional(),
  priority: z.enum(['low', 'medium', 'high']).nullish(),
  dueDate: z.iso.datetime().nullish(),
  assignedToId: z.string().nullish(),
  conditionItemId: z.string().nullable().optional(),
  conditionResult: z.enum(['', 'pass', 'fail', 'na']).optional(),
  dueOffsetDays: z.number().int().min(0).max(365).nullable().optional(),
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
      checklist: checklistAccessWhere(session.user.id, session.user.role, session.user.organizationId),
    },
    select: { id: true, checked: true, checklist: { select: { dueDate: true } } },
  })
  if (!item) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // An item assignee must belong to the same organisation.
  if (parsed.data.assignedToId) {
    const assignee = await prisma.user.findFirst({
      where: { id: parsed.data.assignedToId, organizationId: session.user.organizationId },
      select: { id: true },
    })
    if (!assignee) {
      return NextResponse.json({ error: 'Assignee not found' }, { status: 400 })
    }
  }

  // The controlling item must be on this list, and not the item itself.
  if (parsed.data.conditionItemId) {
    const controller = await prisma.checklistItem.findFirst({
      where: { id: parsed.data.conditionItemId, checklistId: id, NOT: { id: itemId } },
      select: { id: true },
    })
    if (!controller) return NextResponse.json({ error: 'Condition item not found' }, { status: 400 })
  }

  const { checked: requestedChecked, priority, dueDate, assignedToId, ...scalars } = parsed.data
  // Recording a result counts as doing the item; unticking clears the result.
  const checked = requestedChecked ?? (scalars.result && !item.checked ? true : undefined)
  if (checked === false) scalars.result = ''
  const data: Record<string, unknown> = { ...scalars }
  if (priority !== undefined) data.priority = priority ?? null
  if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null
  if (assignedToId !== undefined) data.assignedToId = assignedToId ?? null
  if (parsed.data.conditionItemId === null) data.conditionResult = ''
  if (parsed.data.dueOffsetDays !== undefined) {
    // An offset ties the item to the list's due date; clearing it keeps whatever date was set.
    data.dueDate = offsetDueDate(item.checklist.dueDate, parsed.data.dueOffsetDays) ?? data.dueDate ?? null
  }
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
  // A result or condition change can reveal or hide items, so re-check then too.
  const visibilityMayChange =
    scalars.result !== undefined || parsed.data.conditionItemId !== undefined || parsed.data.conditionResult !== undefined
  if (checked === true) logActivity(id, session.user.name, 'item_checked', updated.text)
  if (checked === true || visibilityMayChange) {
    const remaining = await countRemainingItems(id)
    if (remaining === 0 && checked === true) {
      await completeChecklist(id, session.user.id)
      checklistCompleted = true
      logActivity(id, session.user.name, 'completed')
    } else if (remaining > 0 && checked !== true) {
      const reopened = await prisma.checklist.updateMany({
        where: { id, status: 'completed' },
        data: { status: 'active', ...CLEAR_COMPLETION },
      })
      if (reopened.count > 0) logActivity(id, session.user.name, 'reopened')
    }
  }
  if (checked === false) {
    logActivity(id, session.user.name, 'item_unchecked', updated.text)
    const reopened = await prisma.checklist.updateMany({
      where: { id, status: 'completed' },
      data: { status: 'active', ...CLEAR_COMPLETION },
    })
    if (reopened.count > 0) {
      logActivity(id, session.user.name, 'reopened')
    }
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
  const item = await prisma.checklistItem.findFirst({
    where: {
      id: itemId,
      checklistId: id,
      checklist: checklistAccessWhere(session.user.id, session.user.role, session.user.organizationId),
    },
    select: { id: true, text: true },
  })
  if (item) {
    const paths = await storagePathsForItem(item.id)
    const deleted = await prisma.checklistItem
      .delete({ where: { id: item.id } })
      .then(() => true)
      .catch((err) => {
        console.error('Checklist item delete failed:', err)
        return false
      })
    if (deleted) await deleteStoredFiles(paths)
    logActivity(id, session.user.name, 'item_removed', item.text)
  }
  return NextResponse.json({ ok: true })
}
