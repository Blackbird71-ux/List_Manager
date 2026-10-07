import { describe, expect, it } from 'vitest'
import { checkSignOff, isPendingSignOff } from '@/lib/sign-off'

const pending = { status: 'completed', requiresSignOff: true, signedOffAt: null, completedById: 'worker' }

describe('checkSignOff', () => {
  it('lets a different manager approve', () => {
    expect(checkSignOff(pending, { id: 'boss', role: 'manager' })).toEqual({ ok: true })
    expect(checkSignOff(pending, { id: 'root', role: 'admin' })).toEqual({ ok: true })
  })

  it('blocks the person who completed it, even a manager', () => {
    const r = checkSignOff(pending, { id: 'worker', role: 'manager' })
    expect(r.ok).toBe(false)
  })

  it('blocks plain members', () => {
    const r = checkSignOff(pending, { id: 'boss', role: 'member' })
    expect(r).toMatchObject({ ok: false, status: 403 })
  })

  it('rejects lists that need no sign-off, are unfinished or already signed', () => {
    const boss = { id: 'boss', role: 'manager' }
    expect(checkSignOff({ ...pending, requiresSignOff: false }, boss)).toMatchObject({ status: 409 })
    expect(checkSignOff({ ...pending, status: 'active' }, boss)).toMatchObject({ status: 409 })
    expect(checkSignOff({ ...pending, signedOffAt: new Date() }, boss)).toMatchObject({ status: 409 })
    expect(isPendingSignOff({ ...pending, signedOffAt: new Date() })).toBe(false)
  })
})
