import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clientIp, rateLimit, resetRateLimits } from '@/lib/rate-limit'

const WINDOW = 60_000

beforeEach(() => {
  vi.useFakeTimers()
  resetRateLimits()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('rateLimit', () => {
  it('allows attempts up to the limit and refuses the next one', () => {
    for (let i = 0; i < 3; i++) {
      expect(rateLimit('k', 3, WINDOW)).toBe(true)
    }
    expect(rateLimit('k', 3, WINDOW)).toBe(false)
  })

  it('keeps refusing while the window is still full', () => {
    for (let i = 0; i < 3; i++) rateLimit('k', 3, WINDOW)
    vi.advanceTimersByTime(WINDOW / 2)
    expect(rateLimit('k', 3, WINDOW)).toBe(false)
  })

  it('allows again once old attempts fall out of the window', () => {
    for (let i = 0; i < 3; i++) rateLimit('k', 3, WINDOW)
    expect(rateLimit('k', 3, WINDOW)).toBe(false)
    vi.advanceTimersByTime(WINDOW + 1)
    expect(rateLimit('k', 3, WINDOW)).toBe(true)
  })

  it('slides rather than resets: staggered attempts free up one slot at a time', () => {
    rateLimit('k', 2, WINDOW) // t=0
    vi.advanceTimersByTime(WINDOW / 2)
    rateLimit('k', 2, WINDOW) // t=30s
    expect(rateLimit('k', 2, WINDOW)).toBe(false) // both still in window
    vi.advanceTimersByTime(WINDOW / 2 + 1) // t=60s+: first attempt expired
    expect(rateLimit('k', 2, WINDOW)).toBe(true)
    expect(rateLimit('k', 2, WINDOW)).toBe(false) // second + the one just made
  })

  it('tracks keys independently', () => {
    for (let i = 0; i < 3; i++) rateLimit('a', 3, WINDOW)
    expect(rateLimit('a', 3, WINDOW)).toBe(false)
    expect(rateLimit('b', 3, WINDOW)).toBe(true)
  })

  it('a refused attempt does not extend the window', () => {
    for (let i = 0; i < 3; i++) rateLimit('k', 3, WINDOW)
    // Hammering while blocked must not push the unblock time further out.
    vi.advanceTimersByTime(WINDOW - 10)
    expect(rateLimit('k', 3, WINDOW)).toBe(false)
    vi.advanceTimersByTime(11)
    expect(rateLimit('k', 3, WINDOW)).toBe(true)
  })
})

describe('clientIp', () => {
  it('takes the first hop of x-forwarded-for', () => {
    const req = new Request('http://x', {
      headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' },
    })
    expect(clientIp(req)).toBe('203.0.113.7')
  })

  it('falls back to a shared bucket without the header', () => {
    expect(clientIp(new Request('http://x'))).toBe('unknown')
  })
})
