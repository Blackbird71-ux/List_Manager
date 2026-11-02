import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checklistAccessWhere } from '@/lib/access'
import { formatInTz } from '@/lib/timezone'
import { ScanStartButton } from '@/components/ScanStartButton'
import { AppShell } from '@/components/AppShell'

// Where a template's QR label lands: straight into the one open checklist for it,
// a choice when there are several, or a one-tap start when there are none.
export default async function ScanPage({ params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params
  const session = await auth()
  if (!session?.user?.id) redirect(`/login?next=/scan/${templateId}`)
  const { id: userId, role, organizationId } = session.user

  const template = await prisma.template.findFirst({
    where: { id: templateId, organizationId },
    select: { id: true, title: true, archived: true },
  })
  if (!template) notFound()

  const open = await prisma.checklist.findMany({
    where: { AND: [checklistAccessWhere(userId, role, organizationId), { templateId, status: 'active' }] },
    orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
    select: { id: true, title: true, dueDate: true, assignedTo: { select: { name: true } } },
    take: 20,
  })
  if (open.length === 1) redirect(`/checklists/${open[0].id}`)

  return (
    <AppShell user={{ name: session.user.name, role: session.user.role }}>
    <div className="mx-auto max-w-md space-y-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted">Scanned</p>
        <h1 className="text-xl font-semibold">{template.title}</h1>
      </div>
      {open.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-muted">These checklists are open — pick one to carry on:</p>
          {open.map((c) => (
            <Link
              key={c.id}
              href={`/checklists/${c.id}`}
              className="block rounded-xl border border-border bg-panel p-3 hover:bg-hover"
            >
              <span className="font-medium">{c.title}</span>
              <span className="block text-xs text-muted">
                {c.dueDate ? `Due ${formatInTz(c.dueDate, { day: 'numeric', month: 'short' })}` : 'No due date'}
                {c.assignedTo && ` · ${c.assignedTo.name}`}
              </span>
            </Link>
          ))}
        </div>
      )}
      {template.archived ? (
        <p className="rounded-xl border border-border bg-panel p-3 text-sm text-muted">
          This template is archived, so new checklists can’t be started from it. Ask a manager to restore it on the
          Templates page.
        </p>
      ) : (
        <div className="space-y-2">
          {open.length === 0 && <p className="text-sm text-muted">There’s no open checklist for this yet.</p>}
          <ScanStartButton templateId={template.id} label={open.length > 0 ? 'Start another' : 'Start checklist'} />
        </div>
      )}
    </div>
    </AppShell>
  )
}
