import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checklistAccessWhere } from '@/lib/access'
import { CLEAR_COMPLETION } from '@/lib/checklist-helpers'
import { checkSignOff } from '@/lib/sign-off'
import { notify } from '@/lib/notifications'
import { logActivity } from '@/lib/activity'

const schema = z.object({
  decision: z.enum(['approve', 'reject']),
  note: z.string().trim().max(1000).default(''),
})

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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
  const { decision, note } = parsed.data
  if (decision === 'reject' && !note) {
    return NextResponse.json({ error: 'Say why it is being sent back' }, { status: 400 })
  }

  const checklist = await prisma.checklist.findFirst({
    where: { id, ...checklistAccessWhere(session.user.id, session.user.role, session.user.organizationId) },
    select: {
      title: true,
      status: true,
      requiresSignOff: true,
      signedOffAt: true,
      completedById: true,
      createdById: true,
      assignedToId: true,
    },
  })
  if (!checklist) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const check = checkSignOff(checklist, session.user)
  if (!check.ok) {
    return NextResponse.json({ error: check.error }, { status: check.status })
  }

  // Tell whoever did the work (falling back to the creator).
  const notifyId = checklist.completedById ?? checklist.createdById

  if (decision === 'approve') {
    // Guard on signedOffAt so two approvers can't both sign.
    const done = await prisma.checklist.updateMany({
      where: { id, signedOffAt: null },
      data: {
        signedOffById: session.user.id,
        signedOffByName: session.user.name,
        signedOffAt: new Date(),
        signOffNote: note,
      },
    })
    if (done.count === 0) {
      return NextResponse.json({ error: 'Nothing to sign off' }, { status: 409 })
    }
    logActivity(id, session.user.name, 'signed_off', note)
    if (notifyId !== session.user.id) {
      await notify(notifyId, 'Checklist signed off', `${session.user.name} signed off "${checklist.title}".`, id)
    }
  } else {
    await prisma.checklist.update({
      where: { id },
      data: { status: 'active', ...CLEAR_COMPLETION },
    })
    logActivity(id, session.user.name, 'sign_off_rejected', note)
    if (notifyId !== session.user.id) {
      await notify(
        notifyId,
        'Checklist sent back',
        `${session.user.name} sent "${checklist.title}" back: ${note}`,
        id,
        { email: true }
      )
    }
  }

  return NextResponse.json({ ok: true })
}
