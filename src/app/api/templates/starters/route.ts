import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { normalizeItemType } from '@/lib/item-types'
import { findStarters } from '@/lib/starter-templates'

const schema = z.object({ keys: z.array(z.string().max(50)).min(1).max(20) })

// Adds the chosen starter templates to the caller's organisation. A starter whose
// title is already in use (and not archived) is skipped, so clicking twice is harmless.
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }
  const starters = findStarters(parsed.data.keys)
  if (starters.length === 0) {
    return NextResponse.json({ error: 'Unknown starter template' }, { status: 400 })
  }

  const { organizationId, id: userId } = session.user
  const existing = await prisma.template.findMany({
    where: { organizationId, archived: false, title: { in: starters.map((s) => s.title) } },
    select: { title: true },
  })
  const taken = new Set(existing.map((t) => t.title))
  const toAdd = starters.filter((s) => !taken.has(s.title))

  await prisma.$transaction(
    toAdd.map((s) =>
      prisma.template.create({
        data: {
          title: s.title,
          description: s.description,
          category: s.category,
          recurrence: s.recurrence,
          requiresSignOff: s.requiresSignOff,
          organizationId,
          createdById: userId,
          items: {
            create: s.items.map((item, idx) => ({
              text: item.text,
              priority: item.priority ?? null,
              section: item.section ?? '',
              ...normalizeItemType(item),
              sortOrder: idx,
            })),
          },
        },
      })
    )
  )

  return NextResponse.json({ added: toAdd.length, skipped: starters.length - toAdd.length })
}
