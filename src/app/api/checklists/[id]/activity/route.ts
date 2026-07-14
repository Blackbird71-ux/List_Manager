import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessChecklist } from '@/lib/access'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const allowed = await canAccessChecklist(id, session.user.id, session.user.role)
  if (!allowed) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const activities = await prisma.activityLog.findMany({
    where: { checklistId: id },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  return NextResponse.json({ activities })
}
