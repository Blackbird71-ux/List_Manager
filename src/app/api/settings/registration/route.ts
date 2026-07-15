import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isPrimaryOrgAdmin } from '@/lib/access'
import { ALLOW_NEW_ORGS_KEY, newOrgsAllowed } from '@/lib/registration'

// Whether strangers can found new organisations is instance-wide, so it
// belongs to the primary org's admins.
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

export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied

  return NextResponse.json({ allowNewOrgs: await newOrgsAllowed() })
}

const putSchema = z.object({ allowNewOrgs: z.boolean() })

export async function PUT(request: Request) {
  const denied = await requireAdmin()
  if (denied) return denied

  const body = await request.json().catch(() => null)
  const parsed = putSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const value = parsed.data.allowNewOrgs ? 'true' : 'false'
  await prisma.appSetting.upsert({
    where: { key: ALLOW_NEW_ORGS_KEY },
    create: { key: ALLOW_NEW_ORGS_KEY, value },
    update: { value },
  })
  return NextResponse.json({ allowNewOrgs: parsed.data.allowNewOrgs })
}
