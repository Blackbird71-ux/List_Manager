import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import { canEditTemplate } from '@/lib/access'

describe('canEditTemplate', () => {
  it('allows the creator, managers and admins', () => {
    expect(canEditTemplate({ id: 'u1', role: 'member' }, 'u1')).toBe(true)
    expect(canEditTemplate({ id: 'u2', role: 'manager' }, 'u1')).toBe(true)
    expect(canEditTemplate({ id: 'u2', role: 'admin' }, 'u1')).toBe(true)
  })

  it('blocks other members', () => {
    expect(canEditTemplate({ id: 'u2', role: 'member' }, 'u1')).toBe(false)
  })
})
