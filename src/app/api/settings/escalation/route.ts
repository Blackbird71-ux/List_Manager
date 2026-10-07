import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getEscalationDays, saveEscalationDays } from '@/lib/escalation'
import { requirePrimaryAdmin } from '../drive-backup/guard'

export const dynamic = 'force-dynamic'

// Primary-organisation admin: days overdue before managers are told (0 = off).
export async function GET() {
  const denied = await requirePrimaryAdmin()
  if (denied) return denied
  return NextResponse.json({ days: await getEscalationDays() })
}

const putSchema = z.object({ days: z.number().int().min(0).max(365) })

export async function PUT(request: Request) {
  const denied = await requirePrimaryAdmin()
  if (denied) return denied
  const parsed = putSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }
  await saveEscalationDays(parsed.data.days)
  return NextResponse.json({ ok: true })
}
