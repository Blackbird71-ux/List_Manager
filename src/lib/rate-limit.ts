// In-memory sliding-window rate limiter. The app runs as a single container
// (no horizontal scaling), so per-process counters are sufficient; they reset
// on restart, which is fine for abuse throttling.

const hits = new Map<string, number[]>()

// Stop the map growing without bound under a spray of unique keys (e.g. one
// key per attacking IP): once it gets big, drop entries that are all stale.
const SWEEP_THRESHOLD = 1000

function sweep(cutoff: number): void {
  for (const [key, times] of hits) {
    if (times[times.length - 1]! <= cutoff) hits.delete(key)
  }
}

/**
 * Record an attempt for `key` and report whether it is within `limit`
 * attempts per `windowMs`. Returns false when the caller should be refused.
 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const cutoff = now - windowMs

  if (hits.size > SWEEP_THRESHOLD) sweep(now - 60 * 60 * 1000)

  const recent = (hits.get(key) ?? []).filter((t) => t > cutoff)
  if (recent.length >= limit) {
    hits.set(key, recent)
    return false
  }
  recent.push(now)
  hits.set(key, recent)
  return true
}

/** Client IP for rate-limit keys — first hop of x-forwarded-for behind the
 * tunnel/proxy, or a shared bucket when the header is absent (direct LAN). */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  return forwarded?.split(',')[0]?.trim() || 'unknown'
}

/** Test hook: clear all recorded attempts. */
export function resetRateLimits(): void {
  hits.clear()
}
