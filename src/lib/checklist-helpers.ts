import { prisma } from '@/lib/prisma'
import { computeNextDueDate, isRecurrence } from '@/lib/recurrence'
import { notify } from '@/lib/notifications'
import { formatInTz } from '@/lib/timezone'

const checklistInclude = {
  items: {
    orderBy: { sortOrder: 'asc' as const },
    include: {
      assignedTo: { select: { id: true, name: true, email: true } },
      attachments: {
        select: { id: true, fileName: true, mimeType: true, size: true, createdAt: true },
      },
    },
  },
  fieldValues: true,
  assignedTo: { select: { id: true, name: true, email: true } },
  createdBy: { select: { id: true, name: true, email: true } },
  template: { select: { id: true, title: true } },
  shares: { select: { user: { select: { id: true, name: true, email: true } } } },
}

export function getChecklistInclude() {
  return checklistInclude
}

/**
 * Create a working checklist from a template. Items and custom field
 * definitions are copied; the master template is never mutated.
 */
export async function createChecklistFromTemplate(params: {
  templateId: string
  createdById: string
  title?: string
  dueDate?: Date | null
  assignedToId?: string | null
  priority?: string
  visibility?: string
}) {
  const template = await prisma.template.findUnique({
    where: { id: params.templateId },
    include: {
      items: { orderBy: { sortOrder: 'asc' } },
      customFields: { orderBy: { sortOrder: 'asc' } },
    },
  })
  if (!template) return null

  const checklist = await prisma.checklist.create({
    data: {
      title: params.title?.trim() || template.title,
      description: template.description,
      category: template.category,
      recurrence: template.recurrence,
      priority: params.priority ?? 'medium',
      visibility: params.visibility === 'private' ? 'private' : 'team',
      dueDate: params.dueDate ?? null,
      templateId: template.id,
      templateVersion: template.version,
      createdById: params.createdById,
      assignedToId: params.assignedToId ?? null,
      items: {
        create: template.items.map((item, idx) => ({
          text: item.text,
          priority: item.priority,
          sortOrder: idx,
        })),
      },
      fieldValues: {
        create: template.customFields.map((f) => ({
          name: f.name,
          type: f.type,
          value: '',
        })),
      },
    },
    include: checklistInclude,
  })

  if (checklist.assignedToId && checklist.assignedToId !== params.createdById) {
    await notify(
      checklist.assignedToId,
      'New checklist assigned',
      `You have been assigned "${checklist.title}".`,
      checklist.id
    )
  }

  return checklist
}

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

interface CloneSource {
  id: string
  title: string
  description: string
  category: string
  priority: string
  recurrence: string
  visibility: string
  templateId: string | null
  templateVersion: number | null
  createdById: string
  assignedToId: string | null
  items: { text: string; priority: string | null; assignedToId: string | null }[]
}

/**
 * Copy a checklist for another run: same structure and assignees, all items
 * unchecked, notes and field values blank. Used by the recurrence spawn and
 * the manual "run again" action.
 */
async function cloneForNextRun(
  tx: TxClient,
  source: CloneSource,
  dueDate: Date | null,
  recurrence?: string
) {
  const next = await tx.checklist.create({
    data: {
      title: source.title,
      description: source.description,
      category: source.category,
      priority: source.priority,
      recurrence: recurrence ?? source.recurrence,
      visibility: source.visibility,
      dueDate,
      templateId: source.templateId,
      // The clone copies the source's items, so it ran from the same version.
      templateVersion: source.templateVersion,
      createdById: source.createdById,
      assignedToId: source.assignedToId,
      items: {
        create: source.items.map((item, idx) => ({
          text: item.text,
          priority: item.priority,
          sortOrder: idx,
          assignedToId: item.assignedToId,
        })),
      },
    },
  })

  const fieldValues = await tx.customFieldValue.findMany({
    where: { checklistId: source.id },
    select: { name: true, type: true },
  })
  if (fieldValues.length > 0) {
    await tx.customFieldValue.createMany({
      data: fieldValues.map((f) => ({ checklistId: next.id, name: f.name, type: f.type, value: '' })),
    })
  }

  // Keep the same people in the loop on the next run.
  const shares = await tx.checklistShare.findMany({
    where: { checklistId: source.id },
    select: { userId: true },
  })
  if (shares.length > 0) {
    await tx.checklistShare.createMany({
      data: shares.map((s) => ({ checklistId: next.id, userId: s.userId })),
    })
  }

  return next
}

/**
 * Manual "run again": copy a checklist for a future run without waiting for
 * recurrence. Returns the new checklist's id.
 */
export async function runChecklistAgain(params: {
  checklistId: string
  actorId: string
  dueDate: Date | null
  recurrence?: string
}): Promise<string | null> {
  const source = await prisma.checklist.findUnique({
    where: { id: params.checklistId },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  })
  if (!source) return null

  const copy = await prisma.$transaction(async (tx) => {
    const next = await cloneForNextRun(tx, source, params.dueDate, params.recurrence)
    // Link the chain if this checklist has no next run yet. Also suppresses a
    // duplicate auto-spawn if the source is recurring and completed later.
    const fresh = await tx.checklist.findUnique({
      where: { id: source.id },
      select: { nextInstanceId: true },
    })
    if (!fresh?.nextInstanceId) {
      await tx.checklist.update({
        where: { id: source.id },
        data: { nextInstanceId: next.id },
      })
    }
    return next
  })

  if (source.assignedToId && source.assignedToId !== params.actorId) {
    const dueLabel = params.dueDate
      ? ` Due ${formatInTz(params.dueDate, { day: 'numeric', month: 'short', year: 'numeric' })}.`
      : ''
    await notify(
      source.assignedToId,
      'Checklist scheduled again',
      `"${source.title}" has been scheduled to run again.${dueLabel}`,
      copy.id
    )
  }

  return copy.id
}

/**
 * Reset a checklist in place: uncheck every item and reopen it.
 * Item notes and attachments are kept.
 */
export async function resetChecklist(checklistId: string): Promise<boolean> {
  const existing = await prisma.checklist.findUnique({
    where: { id: checklistId },
    select: { id: true },
  })
  if (!existing) return false

  await prisma.$transaction([
    prisma.checklistItem.updateMany({
      where: { checklistId },
      data: { checked: false, checkedByName: null, checkedAt: null },
    }),
    prisma.checklist.update({
      where: { id: checklistId },
      data: { status: 'active', completedAt: null },
    }),
  ])
  return true
}

/**
 * Completion funnel — the ONLY place a checklist transitions to completed.
 * Marks it complete and, for recurring checklists, spawns the next instance
 * exactly once (nextInstanceId doubles as the double-spawn guard).
 *
 * Called from the item-toggle route (all items checked) and the checklist
 * PATCH route (manual status change).
 */
export async function completeChecklist(checklistId: string): Promise<{ spawnedId: string | null }> {
  const checklist = await prisma.checklist.findUnique({
    where: { id: checklistId },
    include: { items: { orderBy: { sortOrder: 'asc' } } },
  })
  if (!checklist) return { spawnedId: null }

  if (checklist.status !== 'completed') {
    await prisma.checklist.update({
      where: { id: checklistId },
      data: { status: 'completed', completedAt: new Date() },
    })
  }

  // Respawn (Notion-style: completing a recurring list creates the next one)
  if (!isRecurrence(checklist.recurrence) || checklist.recurrence === 'none') {
    return { spawnedId: null }
  }
  if (checklist.nextInstanceId) {
    return { spawnedId: null } // already spawned
  }

  const nextDue = computeNextDueDate(checklist.dueDate, checklist.recurrence)

  const spawned = await prisma.$transaction(async (tx) => {
    // Re-check the guard inside the transaction to prevent a double spawn
    // from two concurrent completion requests.
    const fresh = await tx.checklist.findUnique({
      where: { id: checklistId },
      select: { nextInstanceId: true },
    })
    if (fresh?.nextInstanceId) return null

    const next = await cloneForNextRun(tx, checklist, nextDue)

    await tx.checklist.update({
      where: { id: checklistId },
      data: { nextInstanceId: next.id },
    })

    return next
  })

  if (spawned && checklist.assignedToId) {
    const dueLabel = nextDue
      ? ` Due ${formatInTz(nextDue, { day: 'numeric', month: 'short', year: 'numeric' })}.`
      : ''
    await notify(
      checklist.assignedToId,
      'Recurring checklist renewed',
      `"${checklist.title}" was completed and the next ${checklist.recurrence} instance has been created.${dueLabel}`,
      spawned.id
    )
  }

  return { spawnedId: spawned?.id ?? null }
}
