import { prisma } from '@/lib/prisma'
import { hiddenItemIds } from '@/lib/conditions'

// A failed item carries a corrective action: what will be done, by whom, by
// when. It stays open until someone closes it with a note, and open actions
// block sign-off (see checkSignOff).

/** Where-fragment for items with an open corrective action. */
export const OPEN_ACTION = { result: 'fail', actionClosedAt: null } as const

/** Blank action fields: set whenever an item's result changes or the list is reset. */
export const CLEAR_ACTION = {
  actionText: '',
  actionAssignedToId: null,
  actionDueDate: null,
  actionClosedAt: null,
  actionClosedByName: null,
  actionCloseNote: '',
}

export function isOpenAction(item: { result: string; actionClosedAt: Date | string | null }) {
  return item.result === 'fail' && !item.actionClosedAt
}

/** Open actions on visible items: a failed item hidden by a condition doesn't hold up sign-off. */
export async function countOpenActions(checklistId: string): Promise<number> {
  const items = await prisma.checklistItem.findMany({
    where: { checklistId },
    select: { id: true, result: true, actionClosedAt: true, conditionItemId: true, conditionResult: true },
  })
  const hidden = hiddenItemIds(items)
  return items.filter((i) => !hidden.has(i.id) && isOpenAction(i)).length
}
