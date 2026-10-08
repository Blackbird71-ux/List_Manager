import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { RECURRENCE_OPTIONS } from '@/lib/recurrence'
import { canEditTemplate } from '@/lib/access'
import { recordVersion } from '@/lib/template-history'

const templateInclude = {
  items: { orderBy: { sortOrder: 'asc' as const } },
  customFields: { orderBy: { sortOrder: 'asc' as const } },
  createdBy: { select: { id: true, name: true } },
  _count: { select: { checklists: true } },
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const template = await prisma.template.findFirst({
    where: { id, organizationId: session.user.organizationId },
    include: templateInclude,
  })
  if (!template) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json({ template })
}

const itemSchema = z.object({
  text: z.string().trim().min(1).max(500),
  priority: z.enum(['low', 'medium', 'high']).nullish(),
  section: z.string().trim().max(200).default(''),
  indent: z.number().int().min(0).max(1).default(0),
  conditionIndex: z.number().int().min(0).nullish(),
  conditionResult: z.enum(['', 'pass', 'fail', 'na']).default(''),
  dueOffsetDays: z.number().int().min(0).max(365).nullish(),
})

const fieldSchema = z.object({
  name: z.string().trim().min(1).max(100),
  type: z.enum(['text', 'dropdown', 'user']),
  options: z.array(z.string().trim().min(1).max(100)).default([]),
  required: z.boolean().default(true),
})

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  category: z.string().trim().max(100).optional(),
  recurrence: z.enum(RECURRENCE_OPTIONS).optional(),
  archived: z.boolean().optional(),
  requiresSignOff: z.boolean().optional(),
  // When present, items/customFields replace the template's lists wholesale.
  items: z.array(itemSchema).optional(),
  customFields: z.array(fieldSchema).optional(),
})

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  }

  const existing = await prisma.template.findFirst({
    where: { id, organizationId: session.user.organizationId },
    select: { id: true, createdById: true },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (!canEditTemplate(session.user, existing.createdById)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { items, customFields, ...scalars } = parsed.data

  const template = await prisma.$transaction(async (tx) => {
    const structural = Boolean(items || customFields)
    if (structural) {
      // Keep the pre-edit state too, so templates created before history existed get a baseline.
      const before = await tx.template.findUniqueOrThrow({
        where: { id },
        include: templateInclude,
      })
      await recordVersion(tx, id, before.version, before, session.user.name ?? '')
    }
    if (items) {
      await tx.templateItem.deleteMany({ where: { templateId: id } })
      await tx.templateItem.createMany({
        data: items.map((item, idx) => ({
          templateId: id,
          text: item.text,
          priority: item.priority ?? null,
          section: item.section,
          indent: item.indent,
          conditionIndex: item.conditionIndex ?? null,
          conditionResult: item.conditionIndex == null ? '' : item.conditionResult,
          dueOffsetDays: item.dueOffsetDays ?? null,
          sortOrder: idx,
        })),
      })
    }
    if (customFields) {
      await tx.customFieldDef.deleteMany({ where: { templateId: id } })
      await tx.customFieldDef.createMany({
        data: customFields.map((f, idx) => ({
          templateId: id,
          name: f.name,
          type: f.type,
          options: JSON.stringify(f.options),
          required: f.required,
          sortOrder: idx,
        })),
      })
    }
    const updated = await tx.template.update({
      where: { id },
      // Structural edits (items/fields) bump the version so checklists can
      // show which template version they ran from.
      data: items || customFields ? { ...scalars, version: { increment: 1 } } : scalars,
      include: templateInclude,
    })
    if (structural) await recordVersion(tx, id, updated.version, updated, session.user.name ?? '')
    return updated
  })

  return NextResponse.json({ template })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const existing = await prisma.template.findFirst({
    where: { id, organizationId: session.user.organizationId },
    select: { createdById: true },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (!canEditTemplate(session.user, existing.createdById)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  // Checklists keep working after template deletion (templateId is SetNull).
  await prisma.template
    .deleteMany({ where: { id, organizationId: session.user.organizationId } })
    .catch((err) => console.error('Template delete failed:', err))
  return NextResponse.json({ ok: true })
}
