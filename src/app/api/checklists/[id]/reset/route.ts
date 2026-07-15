import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessChecklist } from '@/lib/access'
import { getChecklistInclude, resetChecklist } from '@/lib/checklist-helpers'
import { logActivity } from '@/lib/activity'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const allowed = await canAccessChecklist(id, session.user.id, session.user.role, session.user.organizationId)
  if (!allowed) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const ok = await resetChecklist(id)
  if (!ok) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  logActivity(id, session.user.name, 'reopened', 'reset all items')

  const checklist = await prisma.checklist.findUnique({
    where: { id },
    include: getChecklistInclude(),
  })
  return NextResponse.json({ checklist })
}
