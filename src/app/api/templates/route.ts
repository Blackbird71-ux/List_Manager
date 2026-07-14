import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { RECURRENCE_OPTIONS } from '@/lib/recurrence'

const templateInclude = {
  items: { orderBy: { sortOrder: 'asc' as const } },
  customFields: { orderBy: { sortOrder: 'asc' as const } },
  createdBy: { select: { id: true, name: true } },
  _count: { select: { checklists: true } },
}

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const includeArchived = searchParams.get('archived') === 'true'

  const templates = await prisma.template.findMany({
    where: includeArchived ? {} : { archived: false },
    include: templateInclude,
    orderBy: { title: 'asc' },
  })
  return NextResponse.json({ templates })
}

const itemSchema = z.object({
  text: z.string().trim().min(1).max(500),
  priority: z.enum(['low', 'medium', 'high']).nullish(),
})

const fieldSchema = z.object({
  name: z.string().trim().min(1).max(100),
  type: z.enum(['text', 'dropdown', 'user']),
  options: z.array(z.string().trim().min(1).max(100)).default([]),
  required: z.boolean().default(true),
})

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).default(''),
  category: z.string().trim().max(100).default('general'),
  recurrence: z.enum(RECURRENCE_OPTIONS).default('none'),
  items: z.array(itemSchema).default([]),
  customFields: z.array(fieldSchema).default([]),
})

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const { title, description, category, recurrence, items, customFields } = parsed.data
  const template = await prisma.template.create({
    data: {
      title,
      description,
      category: category || 'general',
      recurrence,
      createdById: session.user.id,
      items: {
        create: items.map((item, idx) => ({
          text: item.text,
          priority: item.priority ?? null,
          sortOrder: idx,
        })),
      },
      customFields: {
        create: customFields.map((f, idx) => ({
          name: f.name,
          type: f.type,
          options: JSON.stringify(f.options),
          required: f.required,
          sortOrder: idx,
        })),
      },
    },
    include: templateInclude,
  })
  return NextResponse.json({ template }, { status: 201 })
}
