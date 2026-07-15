import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

function parseOptions(options: string): string[] {
  try {
    const parsed = JSON.parse(options)
    return Array.isArray(parsed) ? parsed.filter((o) => typeof o === 'string') : []
  } catch {
    return []
  }
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const templates = await prisma.template.findMany({
    where: { archived: false, organizationId: session.user.organizationId },
    include: {
      items: { orderBy: { sortOrder: 'asc' } },
      customFields: { orderBy: { sortOrder: 'asc' } },
    },
    orderBy: { title: 'asc' },
  })

  const payload = {
    app: 'listsmanager',
    kind: 'templates',
    version: 1,
    templates: templates.map((t) => ({
      title: t.title,
      description: t.description,
      category: t.category,
      recurrence: t.recurrence,
      items: t.items.map((i) => ({
        text: i.text,
        priority: i.priority,
        sortOrder: i.sortOrder,
      })),
      customFields: t.customFields.map((f) => ({
        name: f.name,
        type: f.type,
        options: parseOptions(f.options),
        required: f.required,
        sortOrder: f.sortOrder,
      })),
    })),
  }

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="templates-export.json"',
    },
  })
}
