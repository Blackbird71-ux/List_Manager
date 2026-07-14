import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { auth } from '@/lib/auth'
import { canSeeAllChecklists } from '@/lib/access'
import { runOverdueDigest } from '@/lib/digest'

export const dynamic = 'force-dynamic'

function secretMatches(request: Request): boolean {
  const secret = process.env.DIGEST_SECRET
  if (!secret) return false
  const provided = request.headers.get('x-digest-secret') ?? ''
  const a = Buffer.from(provided)
  const b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}

// Triggered by the in-container cron (with the shared secret header) or
// manually by an admin/manager. GET because busybox wget uses GET.
async function handle(request: Request) {
  if (!secretMatches(request)) {
    const session = await auth()
    if (!session?.user?.id || !canSeeAllChecklists(session.user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const result = await runOverdueDigest()
  return NextResponse.json(result)
}

export async function GET(request: Request) {
  return handle(request)
}

export async function POST(request: Request) {
  return handle(request)
}
