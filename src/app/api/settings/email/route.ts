import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getSmtpConfig, smtpSchema } from '@/lib/email'
import { isPrimaryOrgAdmin } from '@/lib/access'

// SMTP config is instance-wide, so it belongs to the primary org's admins.
async function requireAdmin() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!(await isPrimaryOrgAdmin(session.user.role, session.user.organizationId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return null
}

// Admin: current SMTP settings. The password itself is never returned to the
// browser — only whether one is stored.
export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied

  const smtp = await getSmtpConfig()
  if (!smtp) return NextResponse.json({ smtp: null })
  const { pass: _pass, ...rest } = smtp
  return NextResponse.json({ smtp: { ...rest, hasPassword: true } })
}

// Save accepts a blank password to mean "keep the stored one".
const putSchema = smtpSchema.extend({ pass: z.string().max(200) })

export async function PUT(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied

  const body = await request.json().catch(() => null)
  const parsed = putSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  let pass = parsed.data.pass
  if (!pass) {
    const existing = await getSmtpConfig()
    if (!existing) {
      return NextResponse.json({ error: 'App password is required' }, { status: 400 })
    }
    pass = existing.pass
  }

  const value = JSON.stringify({ ...parsed.data, pass })
  await prisma.appSetting.upsert({
    where: { key: 'smtp' },
    create: { key: 'smtp', value },
    update: { value },
  })
  return NextResponse.json({ ok: true })
}

// Admin: remove the stored SMTP config (disables self-service reset emails).
export async function DELETE() {
  const denied = await requireAdmin()
  if (denied) return denied

  await prisma.appSetting.deleteMany({ where: { key: 'smtp' } })
  return NextResponse.json({ ok: true })
}
