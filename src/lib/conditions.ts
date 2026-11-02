interface ConditionalItem {
  id: string
  result: string
  conditionItemId?: string | null
  conditionResult?: string
}

/**
 * Ids of items hidden by a condition: an item with a condition is shown only
 * once its controlling item carries the required result. A hidden controller
 * hides its dependants too, and a missing controller leaves the item visible.
 */
export function hiddenItemIds(items: ConditionalItem[]): Set<string> {
  const byId = new Map(items.map((i) => [i.id, i]))
  const hidden = new Set<string>()
  const isHidden = (item: ConditionalItem, seen: Set<string>): boolean => {
    if (!item.conditionItemId || !item.conditionResult) return false
    const controller = byId.get(item.conditionItemId)
    if (!controller || seen.has(controller.id)) return false
    if (controller.result !== item.conditionResult) return true
    return isHidden(controller, new Set(seen).add(item.id))
  }
  for (const item of items) if (isHidden(item, new Set([item.id]))) hidden.add(item.id)
  return hidden
}

/** Ticked and total counts over the items a condition doesn't hide — the count the list itself shows. */
export function visibleProgress(items: (ConditionalItem & { checked: boolean })[]): { done: number; total: number } {
  const hidden = hiddenItemIds(items)
  const shown = items.filter((i) => !hidden.has(i.id))
  return { done: shown.filter((i) => i.checked).length, total: shown.length }
}

/** An item's own due date: `offsetDays` before the checklist's due date. */
export function offsetDueDate(listDue: Date | null | undefined, offsetDays: number | null | undefined): Date | null {
  if (!listDue || offsetDays == null) return null
  return new Date(listDue.getTime() - offsetDays * 86_400_000)
}
