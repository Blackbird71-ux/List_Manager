import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { RECURRENCE_OPTIONS } from '@/lib/recurrence'
import { canAccessChecklist } from '@/lib/access'
import { runChecklistAgain } from '@/lib/checklist-helpers'
import { logActivity } from '@/lib/activity'

const schema = z.object({
  dueDate: z.iso.datetime().nullish(),
  recurrence: z.enum(RECURRENCE_OPTIONS).optional(),
})

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body ?? {})
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const allowed = await canAccessChecklist(id, session.user.id, session.user.role, session.user.organizationId)
  if (!allowed) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const newId = await runChecklistAgain({
    checklistId: id,
    actorId: session.user.id,
    dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
    recurrence: parsed.data.recurrence,
  })
  if (!newId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  logActivity(newId, session.user.name, 'created', 'run again')

  return NextResponse.json({ id: newId }, { status: 201 })
}
