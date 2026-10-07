import { NextResponse } from 'next/server'
import { runDriveBackup } from '@/lib/drive-backup'
import { requirePrimaryAdmin } from '../guard'

export const dynamic = 'force-dynamic'

// Admin: run a backup now ("Back up now" button).
export async function POST() {
  const denied = await requirePrimaryAdmin()
  if (denied) return denied

  return NextResponse.json(await runDriveBackup())
}
