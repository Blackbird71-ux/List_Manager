import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  checklist: null as Record<string, unknown> | null,
  transactions: 0,
}))

vi.mock('@/lib/prisma', () => {
  const model = new Proxy(
    {},
    {
      get: (_t, method: string) => async () => {
        if (method === 'findUnique') return state.checklist
        if (method === 'findMany') return []
        return null
      },
    }
  )
  const prisma = new Proxy(
    {
      $transaction: async () => {
        state.transactions += 1
        return { id: 'next-run' }
      },
    },
    { get: (target, prop: string) => (prop in target ? target[prop as keyof typeof target] : model) }
  )
  return { prisma }
})
vi.mock('@/lib/webhook', () => ({ sendWebhook: vi.fn() }))
vi.mock('@/lib/notifications', () => ({ notify: vi.fn() }))
vi.mock('@/lib/activity', () => ({ logActivity: vi.fn() }))
vi.mock('@/lib/attachment-files', () => ({ copyChecklistAttachments: vi.fn() }))

import { completeChecklist, spawnAfterSignOff } from '@/lib/checklist-helpers'

function list(over: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    title: 'Weekly check',
    status: 'active',
    recurrence: 'weekly',
    requiresSignOff: false,
    nextInstanceId: null,
    dueDate: new Date('2026-07-14T00:00:00Z'),
    assignedToId: null,
    reminderOffsetHours: null,
    items: [],
    ...over,
  }
}

beforeEach(() => {
  state.transactions = 0
})

describe('completion vs sign-off for recurring lists', () => {
  it('spawns the next run on completion when no sign-off is needed', async () => {
    state.checklist = list()
    const r = await completeChecklist('c1', 'u1')
    expect(r.spawnedId).toBe('next-run')
    expect(state.transactions).toBe(1)
  })

  it('does not spawn on completion when sign-off is required', async () => {
    state.checklist = list({ requiresSignOff: true })
    const r = await completeChecklist('c1', 'u1')
    expect(r.spawnedId).toBeNull()
    expect(state.transactions).toBe(0)
  })

  it('spawns the next run once the list is signed off', async () => {
    state.checklist = list({ requiresSignOff: true, status: 'completed' })
    expect(await spawnAfterSignOff('c1')).toBe('next-run')
    expect(state.transactions).toBe(1)
  })

  it('does not spawn twice if the next run already exists', async () => {
    state.checklist = list({ requiresSignOff: true, status: 'completed', nextInstanceId: 'x' })
    expect(await spawnAfterSignOff('c1')).toBeNull()
    expect(state.transactions).toBe(0)
  })

  it('does not spawn for non-recurring lists, signed off or not', async () => {
    state.checklist = list({ recurrence: 'none', requiresSignOff: true, status: 'completed' })
    expect(await spawnAfterSignOff('c1')).toBeNull()
    state.checklist = list({ recurrence: 'none' })
    expect((await completeChecklist('c1')).spawnedId).toBeNull()
    expect(state.transactions).toBe(0)
  })
})
