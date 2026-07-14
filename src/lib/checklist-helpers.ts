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
      dueDate: params.dueDate ?? null,
      templateId: template.id,
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

    const next = await tx.checklist.create({
      data: {
        title: checklist.title,
        description: checklist.description,
        category: checklist.category,
        priority: checklist.priority,
        recurrence: checklist.recurrence,
        dueDate: nextDue,
        templateId: checklist.templateId,
        createdById: checklist.createdById,
        assignedToId: checklist.assignedToId,
        items: {
          create: checklist.items.map((item, idx) => ({
            text: item.text,
            priority: item.priority,
            sortOrder: idx,
            assignedToId: item.assignedToId,
          })),
        },
      },
    })

    const fieldValues = await tx.customFieldValue.findMany({
      where: { checklistId },
      select: { name: true, type: true },
    })
    if (fieldValues.length > 0) {
      await tx.customFieldValue.createMany({
        data: fieldValues.map((f) => ({ checklistId: next.id, name: f.name, type: f.type, value: '' })),
      })
    }

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
