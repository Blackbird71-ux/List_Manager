import { NextResponse } from 'next/server'
import { z } from 'zod'
import { randomBytes } from 'crypto'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Any signed-in user: their own organisation. The invite code is only
// revealed to admins — it grants membership.
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const organization = await prisma.organization.findUnique({
    where: { id: session.user.organizationId },
    select: { id: true, name: true, inviteCode: true, isPrimary: true },
  })
  if (!organization) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (session.user.role !== 'admin') {
    const { inviteCode: _inviteCode, ...rest } = organization
    return NextResponse.json({ organization: rest })
  }
  return NextResponse.json({ organization })
}

const patchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  // Invalidates the old invite code (e.g. after it leaks).
  regenerateInviteCode: z.boolean().optional(),
})

// Admin only: rename their organisation or rotate its invite code.
export async function PATCH(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const data: Record<string, unknown> = {}
  if (parsed.data.name !== undefined) data.name = parsed.data.name
  if (parsed.data.regenerateInviteCode) data.inviteCode = randomBytes(6).toString('hex')

  const organization = await prisma.organization.update({
    where: { id: session.user.organizationId },
    data,
    select: { id: true, name: true, inviteCode: true, isPrimary: true },
  })
  return NextResponse.json({ organization })
}
