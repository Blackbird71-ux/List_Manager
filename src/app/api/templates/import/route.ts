import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { RECURRENCE_OPTIONS } from '@/lib/recurrence'

const itemSchema = z.object({
  text: z.string().trim().min(1).max(500),
  priority: z.enum(['low', 'medium', 'high']).nullish(),
  sortOrder: z.number().int().min(0).default(0),
})

const fieldSchema = z.object({
  name: z.string().trim().min(1).max(100),
  type: z.enum(['text', 'dropdown', 'user']),
  options: z.array(z.string().trim().min(1).max(100)).max(100).default([]),
  required: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
})

const templateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).default(''),
  category: z.string().trim().max(100).default('general'),
  recurrence: z.enum(RECURRENCE_OPTIONS).default('none'),
  items: z.array(itemSchema).max(200).default([]),
  customFields: z.array(fieldSchema).max(50).default([]),
})

const importSchema = z.object({
  app: z.literal('listsmanager'),
  kind: z.literal('templates'),
  version: z.literal(1),
  templates: z.array(templateSchema).max(100),
})

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const parsed = importSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid import file' }, { status: 400 })
  }

  await prisma.$transaction(
    parsed.data.templates.map((t) =>
      prisma.template.create({
        data: {
          title: t.title,
          description: t.description,
          category: t.category || 'general',
          recurrence: t.recurrence,
          version: 1,
          archived: false,
          organizationId: session.user.organizationId,
          createdById: session.user.id,
          items: {
            create: [...t.items]
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((item, idx) => ({
                text: item.text,
                priority: item.priority ?? null,
                sortOrder: idx,
              })),
          },
          customFields: {
            create: [...t.customFields]
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((f, idx) => ({
                name: f.name,
                type: f.type,
                options: JSON.stringify(f.options),
                required: f.required,
                sortOrder: idx,
              })),
          },
        },
      })
    )
  )

  return NextResponse.json({ imported: parsed.data.templates.length })
}
