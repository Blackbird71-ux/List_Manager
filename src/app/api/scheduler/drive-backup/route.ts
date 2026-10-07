import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { auth } from '@/lib/auth'
import { isPrimaryOrgAdmin } from '@/lib/access'
import { getDriveConfig, runDriveBackup } from '@/lib/drive-backup'

export const dynamic = 'force-dynamic'

function secretMatches(request: Request): boolean {
  const secret = process.env.DIGEST_SECRET
  if (!secret) return false
  const provided = request.headers.get('x-digest-secret') ?? ''
  const a = Buffer.from(provided)
  const b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}

// Triggered nightly by the in-container cron (shared secret header) or by a
// primary-org admin. GET because busybox wget uses GET.
async function handle(request: Request) {
  if (!secretMatches(request)) {
    const session = await auth()
    if (
      !session?.user?.id ||
      !(await isPrimaryOrgAdmin(session.user.role, session.user.organizationId))
    ) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  // Not connected is a normal state (backup is optional), not an error.
  if (!(await getDriveConfig())?.refreshToken) {
    return NextResponse.json({ skipped: 'Google Drive is not connected' })
  }
  return NextResponse.json(await runDriveBackup())
}

export const GET = handle
export const POST = handle
