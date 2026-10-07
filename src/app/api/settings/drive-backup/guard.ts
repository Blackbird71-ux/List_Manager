import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { isPrimaryOrgAdmin } from '@/lib/access'

// Drive backup is instance-wide, so only primary-organisation admins may touch it.
// Returns a response to send when the caller is not allowed, else null.
export async function requirePrimaryAdmin() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!(await isPrimaryOrgAdmin(session.user.role, session.user.organizationId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return null
}
