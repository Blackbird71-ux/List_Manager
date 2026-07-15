import { NextResponse } from 'next/server'
import { DateTime } from 'luxon'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checklistAccessWhere } from '@/lib/access'
import { APP_TIMEZONE } from '@/lib/timezone'

export const dynamic = 'force-dynamic'

// Quote for CSV and neutralise spreadsheet formula injection (=, +, -, @).
function csvCell(value: string): string {
  let v = value
  if (/^[=+\-@]/.test(v)) v = `'${v}`
  return `"${v.replace(/"/g, '""')}"`
}

function fmt(date: Date | null): string {
  if (!date) return ''
  return DateTime.fromJSDate(date).setZone(APP_TIMEZONE).toFormat('yyyy-MM-dd HH:mm')
}

export async function GET(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const statusParam = searchParams.get('status') ?? 'completed'
  const status = ['completed', 'active', 'all'].includes(statusParam) ? statusParam : 'completed'
  const category = searchParams.get('category')
  const search = searchParams.get('q')?.trim()

  const checklists = await prisma.checklist.findMany({
    where: {
      AND: [
        checklistAccessWhere(session.user.id, session.user.role, session.user.organizationId),
        {
          ...(status !== 'all' ? { status } : {}),
          ...(category ? { category } : {}),
          ...(search ? { title: { contains: search } } : {}),
        },
      ],
    },
    select: {
      title: true,
      category: true,
      status: true,
      priority: true,
      visibility: true,
      createdAt: true,
      dueDate: true,
      completedAt: true,
      templateVersion: true,
      createdBy: { select: { name: true } },
      assignedTo: { select: { name: true } },
      template: { select: { title: true } },
      items: { select: { checked: true } },
    },
    orderBy: [{ completedAt: 'desc' }, { createdAt: 'desc' }],
  })

  const header = [
    'Title',
    'Category',
    'Status',
    'Priority',
    'Visibility',
    'Created By',
    'Assigned To',
    'Template',
    'Template Version',
    'Created At',
    'Due Date',
    'Completed At',
    'Items Total',
    'Items Checked',
  ]
  const rows = checklists.map((c) =>
    [
      c.title,
      c.category,
      c.status,
      c.priority,
      c.visibility,
      c.createdBy.name,
      c.assignedTo?.name ?? '',
      c.template?.title ?? '',
      c.templateVersion !== null ? String(c.templateVersion) : '',
      fmt(c.createdAt),
      fmt(c.dueDate),
      fmt(c.completedAt),
      String(c.items.length),
      String(c.items.filter((i) => i.checked).length),
    ]
      .map(csvCell)
      .join(',')
  )
  const csv = [header.map(csvCell).join(','), ...rows].join('\r\n') + '\r\n'

  const today = DateTime.now().setZone(APP_TIMEZONE).toFormat('yyyy-MM-dd')
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="checklists-${today}.csv"`,
    },
  })
}
