import { numberResult } from '@/lib/item-types'

// Item changes made with no connection are kept on this device (per user) and
// replayed in order once it's back. Only item PATCHes queue — ticks, answers,
// results, notes; everything else still needs a connection.

const KEY = 'lm.offlineQueue'
export const QUEUE_EVENT = 'lm-offline-queue'
// The server accepts an offline tick time up to this old; older ones are stamped at sync.
export const MAX_OFFLINE_AGE_MS = 7 * 24 * 60 * 60 * 1000

export interface QueuedChange {
  userId: string
  checklistId: string
  itemId: string
  data: Record<string, unknown>
  queuedAt: string
}

export type SaveResult =
  | { status: 'saved'; body: Record<string, unknown> }
  | { status: 'queued' }
  | { status: 'rejected'; error: string }

export interface FlushResult {
  sent: number
  rejected: { itemId: string; error: string }[]
  // Stopped early: still offline, signed out, or the server failed.
  stopped: boolean
}

function read(): QueuedChange[] {
  try {
    const q = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(q) ? q : []
  } catch {
    return []
  }
}

function write(q: QueuedChange[]): boolean {
  try {
    if (q.length === 0) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, JSON.stringify(q))
    window.dispatchEvent(new Event(QUEUE_EVENT))
    return true
  } catch {
    return false
  }
}

export function pendingChanges(userId: string, checklistId?: string): QueuedChange[] {
  return read().filter((c) => c.userId === userId && (!checklistId || c.checklistId === checklistId))
}

export function hasQueuedChanges(): boolean {
  return read().length > 0
}

/** Signing out drops anything unsent, so the next person on the device never replays it. */
export function clearQueue() {
  write([])
}

const itemUrl = (c: { checklistId: string; itemId: string }) => `/api/checklists/${c.checklistId}/items/${c.itemId}`

async function patch(c: Pick<QueuedChange, 'checklistId' | 'itemId' | 'data'>) {
  return fetch(itemUrl(c), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(c.data),
  })
}

/**
 * Save an item change, or queue it when there's no connection. Changes queue behind
 * any already waiting for the same list, so they always reach the server in order.
 */
export async function saveItemChange(change: Omit<QueuedChange, 'queuedAt'>): Promise<SaveResult> {
  const queue = () => {
    const ok = write([...read(), { ...change, queuedAt: new Date().toISOString() }])
    return ok
      ? ({ status: 'queued' } as const)
      : ({ status: 'rejected', error: 'No connection, and this device has no room to keep the change.' } as const)
  }
  if (!navigator.onLine || pendingChanges(change.userId, change.checklistId).length > 0) return queue()
  let res: Response
  try {
    res = await patch(change)
  } catch {
    return queue()
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) return { status: 'rejected', error: body.error ?? 'Could not save the change' }
  return { status: 'saved', body }
}

let flushing: Promise<FlushResult> | null = null

/** Replay this user's queued changes in order. A change the server refuses is dropped and reported. */
export function flushQueue(userId: string): Promise<FlushResult> {
  flushing ??= (async () => {
    const result: FlushResult = { sent: 0, rejected: [], stopped: false }
    for (const c of pendingChanges(userId)) {
      let res: Response
      try {
        res = await patch({ ...c, data: { ...c.data, offlineAt: c.queuedAt } })
      } catch {
        result.stopped = true
        break
      }
      if (res.status === 401 || res.status >= 500) {
        result.stopped = true
        break
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        result.rejected.push({ itemId: c.itemId, error: body.error ?? 'Could not save the change' })
      } else {
        result.sent++
      }
      write(read().filter((q) => !(q.userId === c.userId && q.queuedAt === c.queuedAt && q.itemId === c.itemId)))
    }
    return result
  })().finally(() => {
    flushing = null
  })
  return flushing
}

interface OverlayItem {
  id: string
  kind: string
  checked: boolean
  value: string
  result: string
  notes: string
  minValue: number | null
  maxValue: number | null
}

/** Show queued changes on top of the last copy from the server, roughly as the server will apply them. */
export function applyPending<T extends OverlayItem>(items: T[], changes: QueuedChange[]): T[] {
  if (changes.length === 0) return items
  return items.map((original) => {
    let item = original
    for (const c of changes) {
      if (c.itemId !== item.id) continue
      const d = c.data
      item = { ...item }
      if (typeof d.notes === 'string') item.notes = d.notes
      if (typeof d.value === 'string') {
        item.value = item.kind === 'signature' ? d.value : d.value.trim()
        if (item.kind !== 'check') item.checked = item.value !== ''
        if (item.kind === 'number' && (item.minValue !== null || item.maxValue !== null) && item.value) {
          item.result = numberResult(item.value, item.minValue, item.maxValue)
        }
      }
      if (typeof d.result === 'string') {
        item.result = d.result
        if (d.result) item.checked = true
      }
      if (typeof d.checked === 'boolean') item.checked = d.checked
      if (!item.checked) {
        item.result = ''
        if (item.kind !== 'check') item.value = ''
      }
    }
    return item
  })
}

/** The time to record for a change made offline: when it happened, unless that's implausible. */
export function offlineTimestamp(offlineAt: string | undefined, now = new Date()): Date {
  if (!offlineAt) return now
  const at = new Date(offlineAt)
  const age = now.getTime() - at.getTime()
  return Number.isNaN(age) || age < 0 || age > MAX_OFFLINE_AGE_MS ? now : at
}
