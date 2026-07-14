import { NextResponse } from 'next/server'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const patchSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  role: z.enum(['admin', 'member']).optional(),
  password: z.string().min(8).max(200).optional(),
})

// Admin: edit any user (name, role, password reset).
// Members: change their own name or password only.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const isAdmin = session.user.role === 'admin'
  const isSelf = session.user.id === id
  if (!isAdmin && !isSelf) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }
  if (parsed.data.role !== undefined && !isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Don't let the last admin demote themselves and lock everyone out.
  if (parsed.data.role === 'member') {
    const adminCount = await prisma.user.count({ where: { role: 'admin' } })
    const target = await prisma.user.findUnique({ where: { id }, select: { role: true } })
    if (target?.role === 'admin' && adminCount <= 1) {
      return NextResponse.json({ error: 'Cannot demote the last admin' }, { status: 400 })
    }
  }

  const data: { name?: string; role?: string; password?: string } = {}
  if (parsed.data.name !== undefined) data.name = parsed.data.name
  if (parsed.data.role !== undefined) data.role = parsed.data.role
  if (parsed.data.password !== undefined) data.password = await bcrypt.hash(parsed.data.password, 12)

  const user = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, name: true, email: true, role: true },
  })
  return NextResponse.json({ user })
}

// Admin only; cannot delete yourself.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  if (id === session.user.id) {
    return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 400 })
  }

  try {
    await prisma.user.delete({ where: { id } })
  } catch {
    // FK restrict: the user still owns templates/checklists/attachments.
    return NextResponse.json(
      { error: 'User still owns templates or checklists. Delete or reassign those first.' },
      { status: 409 }
    )
  }
  return NextResponse.json({ ok: true })
}
