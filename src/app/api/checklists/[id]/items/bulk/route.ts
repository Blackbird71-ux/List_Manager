import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checklistAccessWhere } from '@/lib/access'
import { completeChecklist, countRemainingItems } from '@/lib/checklist-helpers'
import { hiddenItemIds } from '@/lib/conditions'
import { logActivity } from '@/lib/activity'

const bodySchema = z.object({
  // "tick" just ticks; "pass" / "na" also record that result.
  mode: z.enum(['tick', 'pass', 'na']),
})

// Tick every remaining visible item in one go (e.g. "everything passed").
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const checklist = await prisma.checklist.findFirst({
    where: { id, ...checklistAccessWhere(session.user.id, session.user.role, session.user.organizationId) },
    select: { id: true, status: true },
  })
  if (!checklist) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (checklist.status === 'completed') {
    return NextResponse.json({ error: 'This checklist is already completed' }, { status: 409 })
  }

  const items = await prisma.checklistItem.findMany({
    where: { checklistId: id },
    select: { id: true, checked: true, result: true, conditionItemId: true, conditionResult: true },
  })
  const hidden = hiddenItemIds(items)
  const targets = items.filter((i) => !i.checked && !hidden.has(i.id)).map((i) => i.id)
  if (targets.length === 0) {
    return NextResponse.json({ updated: 0, checklistCompleted: false })
  }

  await prisma.checklistItem.updateMany({
    where: { id: { in: targets }, checklistId: id },
    data: {
      checked: true,
      checkedByName: session.user.name,
      checkedAt: new Date(),
      ...(parsed.data.mode === 'tick' ? {} : { result: parsed.data.mode }),
    },
  })
  const label = parsed.data.mode === 'tick' ? 'ticked' : `marked ${parsed.data.mode === 'na' ? 'N/A' : 'pass'}`
  logActivity(id, session.user.name, 'item_checked', `${targets.length} items ${label}`)

  // Setting a result can reveal conditional items, so count again before completing.
  let checklistCompleted = false
  if ((await countRemainingItems(id)) === 0) {
    await completeChecklist(id, session.user.id)
    checklistCompleted = true
    logActivity(id, session.user.name, 'completed')
  }
  return NextResponse.json({ updated: targets.length, checklistCompleted })
}
