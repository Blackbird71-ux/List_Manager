import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const MAX_VERSIONS = 50

// Saved versions of a template, newest first. Scoped to the caller's organisation.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const template = await prisma.template.findFirst({
    where: { id, organizationId: session.user.organizationId },
    select: { id: true, version: true },
  })
  if (!template) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const rows = await prisma.templateVersion.findMany({
    where: { templateId: id },
    orderBy: { version: 'desc' },
    take: MAX_VERSIONS,
  })
  const versions = rows.map((v) => ({
    version: v.version,
    savedByName: v.savedByName,
    createdAt: v.createdAt.toISOString(),
    snapshot: JSON.parse(v.snapshot),
  }))
  return NextResponse.json({ current: template.version, versions })
}
