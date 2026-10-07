import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Dashboard filter views, stored per account (key is derived from the session, never the request).
const keyFor = (userId: string) => `views:${userId}`

const viewSchema = z.object({
  name: z.string().trim().min(1).max(60),
  scopeFilter: z.enum(['all', 'mine', 'private']),
  categoryFilter: z.string().max(100),
  assigneeFilter: z.string().max(100),
  search: z.string().max(200),
  overdueOnly: z.boolean(),
  dueWindow: z.enum(['', 'today', 'week']),
})
const putSchema = z.object({ views: z.array(viewSchema).max(30) })

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const row = await prisma.appSetting.findUnique({ where: { key: keyFor(session.user.id) } })
  let views: unknown[] = []
  try {
    if (row) views = JSON.parse(row.value)
  } catch {
    // unreadable: start empty
  }
  return NextResponse.json({ views })
}

export async function PUT(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = putSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  const key = keyFor(session.user.id)
  const value = JSON.stringify(parsed.data.views)
  await prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } })
  return NextResponse.json({ ok: true })
}
