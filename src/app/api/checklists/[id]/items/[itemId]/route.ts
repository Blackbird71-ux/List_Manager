import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checklistAccessWhere } from '@/lib/access'
import { CLEAR_COMPLETION, completeChecklist, countRemainingItems } from '@/lib/checklist-helpers'
import { logActivity } from '@/lib/activity'
import { offsetDueDate } from '@/lib/conditions'
import { deleteStoredFiles, storagePathsForItem } from '@/lib/attachment-files'
import { CLEAR_ACTION } from '@/lib/corrective-actions'
import { notify } from '@/lib/notifications'
import { itemTypeFields, normalizeItemType, numberResult, validateValue } from '@/lib/item-types'
import { offlineTimestamp } from '@/lib/offline-queue'

const ANSWER_FIRST: Record<string, string> = {
  number: 'Enter the reading first',
  text: 'Enter the answer first',
  signature: 'Sign first',
}

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
  // Corrective action (failed items only).
  actionText: z.string().trim().max(2000).optional(),
  actionAssignedToId: z.string().nullish(),
  actionDueDate: z.iso.datetime().nullish(),
  actionClosed: z.boolean().optional(),
  actionCloseNote: z.string().trim().max(2000).optional(),
  // Answer type settings and the typed answer itself.
  ...itemTypeFields,
  value: z.string().max(250_000).optional(),
  // When a change queued offline was really made; ticks are stamped with it.
  offlineAt: z.iso.datetime().optional(),
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
    select: {
      id: true,
      text: true,
      checked: true,
      result: true,
      actionAssignedToId: true,
      kind: true,
      value: true,
      unit: true,
      minValue: true,
      maxValue: true,
      photoRequired: true,
      checklist: { select: { dueDate: true, title: true } },
    },
  })
  if (!item) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Item and action assignees must belong to the same organisation.
  for (const userId of [parsed.data.assignedToId, parsed.data.actionAssignedToId]) {
    if (!userId) continue
    const assignee = await prisma.user.findFirst({
      where: { id: userId, organizationId: session.user.organizationId },
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

  const {
    checked: requestedChecked,
    priority,
    dueDate,
    assignedToId,
    actionText,
    actionAssignedToId,
    actionDueDate,
    actionClosed,
    actionCloseNote,
    kind,
    unit,
    minValue,
    maxValue,
    photoRequired,
    value,
    offlineAt,
    ...scalars
  } = parsed.data
  const data: Record<string, unknown> = {}

  // Answer type. A new kind starts the item over; a typed answer ticks the item and
  // clearing it unticks; a number reading sets pass/fail when it has a range.
  const typeTouched = [kind, unit, minValue, maxValue, photoRequired].some((v) => v !== undefined)
  const settings = normalizeItemType({
    kind: kind ?? item.kind,
    unit: unit ?? item.unit,
    minValue: minValue === undefined ? item.minValue : minValue,
    maxValue: maxValue === undefined ? item.maxValue : maxValue,
    photoRequired: photoRequired ?? item.photoRequired,
  })
  if (typeTouched) Object.assign(data, settings)
  const kindChanged = settings.kind !== item.kind
  let implied: boolean | undefined
  if (kindChanged) {
    scalars.result ??= ''
    if (item.checked) implied = false
  }
  let answer = value ?? (kindChanged ? '' : undefined)
  if (requestedChecked === false) answer = ''
  if (answer !== undefined) {
    answer = settings.kind === 'signature' ? answer : answer.trim()
    const invalid = validateValue(settings.kind, answer)
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 })
    data.value = answer
    if (settings.kind !== 'check' && value !== undefined) implied = answer !== ''
  }
  const finalValue = answer ?? item.value
  const hasRange = settings.minValue !== null || settings.maxValue !== null
  if (settings.kind === 'number' && hasRange && finalValue && (answer !== undefined || typeTouched)) {
    scalars.result = numberResult(finalValue, settings.minValue, settings.maxValue)
  }

  // Recording a result counts as doing the item; unticking clears the result.
  const checked = requestedChecked ?? implied ?? (scalars.result && !item.checked ? true : undefined)
  if (checked === false) scalars.result = ''
  if (checked === true && !item.checked) {
    if (settings.kind !== 'check' && !finalValue) {
      return NextResponse.json({ error: ANSWER_FIRST[settings.kind] }, { status: 400 })
    }
    if (settings.photoRequired) {
      const photos = await prisma.attachment.count({ where: { itemId, mimeType: { startsWith: 'image/' } } })
      if (photos === 0) return NextResponse.json({ error: 'Add a photo first' }, { status: 400 })
    }
  }
  Object.assign(data, scalars)

  // A new result starts a fresh corrective action (closed ones stay in the activity log).
  const resultChanged = scalars.result !== undefined && scalars.result !== item.result
  if (resultChanged) Object.assign(data, CLEAR_ACTION)
  const touchesAction =
    actionText !== undefined ||
    actionAssignedToId !== undefined ||
    actionDueDate !== undefined ||
    actionClosed !== undefined
  if (touchesAction && (scalars.result ?? item.result) !== 'fail') {
    return NextResponse.json({ error: 'Only a failed item has a corrective action' }, { status: 400 })
  }
  if (actionClosed && !actionCloseNote) {
    return NextResponse.json({ error: 'Say what was done to close the action' }, { status: 400 })
  }
  if (actionText !== undefined) data.actionText = actionText
  if (actionAssignedToId !== undefined) data.actionAssignedToId = actionAssignedToId ?? null
  if (actionDueDate !== undefined) data.actionDueDate = actionDueDate ? new Date(actionDueDate) : null
  if (actionClosed !== undefined) {
    data.actionClosedAt = actionClosed ? new Date() : null
    data.actionClosedByName = actionClosed ? session.user.name : null
    data.actionCloseNote = actionClosed ? actionCloseNote : ''
  }
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
    data.checkedAt = checked ? offlineTimestamp(offlineAt) : null
  }

  const updated = await prisma.checklistItem.update({
    where: { id: itemId },
    data,
    include: {
      assignedTo: { select: { id: true, name: true, email: true } },
      actionAssignedTo: { select: { id: true, name: true, email: true } },
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
  if (checked === true) {
    const answered = updated.kind === 'number' || updated.kind === 'text'
    const detail = answered ? `${updated.text}: ${updated.value.slice(0, 100)}${updated.unit ? ` ${updated.unit}` : ''}` : updated.text
    logActivity(id, session.user.name, 'item_checked', detail)
  }
  if (actionClosed === true) logActivity(id, session.user.name, 'action_closed', `${updated.text}: ${actionCloseNote}`)
  if (actionClosed === false) logActivity(id, session.user.name, 'action_reopened', updated.text)
  const newActionOwner = updated.actionAssignedToId
  if (
    actionAssignedToId !== undefined &&
    newActionOwner &&
    newActionOwner !== item.actionAssignedToId &&
    newActionOwner !== session.user.id
  ) {
    await notify(
      newActionOwner,
      'Corrective action assigned',
      `${session.user.name} asked you to fix "${updated.text}" on "${item.checklist.title}".`,
      id,
      { email: true }
    )
  }
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
