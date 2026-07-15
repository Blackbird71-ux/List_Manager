import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessChecklist } from '@/lib/access'
import { logActivity } from '@/lib/activity'

const schema = z.object({
  itemIds: z.array(z.string().min(1)).min(1).max(500),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const allowed = await canAccessChecklist(id, session.user.id, session.user.role, session.user.organizationId)
  if (!allowed) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // The submitted ids must be exactly this checklist's items — no more, no
  // less, no duplicates — so a stale client can't scramble the order.
  const { itemIds } = parsed.data
  const items = await prisma.checklistItem.findMany({
    where: { checklistId: id },
    select: { id: true },
  })
  const existingIds = new Set(items.map((i) => i.id))
  const submitted = new Set(itemIds)
  if (
    itemIds.length !== submitted.size ||
    submitted.size !== existingIds.size ||
    itemIds.some((itemId) => !existingIds.has(itemId))
  ) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  await prisma.$transaction(
    itemIds.map((itemId, idx) =>
      prisma.checklistItem.update({ where: { id: itemId }, data: { sortOrder: idx } })
    )
  )

  logActivity(id, session.user.name, 'reordered')
  return NextResponse.json({ ok: true })
}
