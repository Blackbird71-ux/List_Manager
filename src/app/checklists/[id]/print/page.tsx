import { Fragment } from 'react'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canAccessChecklist } from '@/lib/access'
import { formatInTz } from '@/lib/timezone'
import { hiddenItemIds } from '@/lib/conditions'
import { PrintButton } from '@/components/PrintButton'

const when = (d: Date | null) =>
  d ? formatInTz(d, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''

const RESULT_LABEL: Record<string, string> = { pass: 'Pass', fail: 'Fail', na: 'N/A' }

// A clean, printable record of one checklist: who did what and when, with results and notes.
export default async function PrintChecklistPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const { id } = await params
  if (!(await canAccessChecklist(id, session.user.id, session.user.role, session.user.organizationId))) notFound()

  const checklist = await prisma.checklist.findUnique({
    where: { id },
    include: {
      items: { orderBy: { sortOrder: 'asc' }, include: { assignedTo: { select: { name: true } } } },
      fieldValues: true,
      assignedTo: { select: { name: true } },
      createdBy: { select: { name: true } },
    },
  })
  if (!checklist) notFound()

  const hidden = hiddenItemIds(checklist.items)
  const items = checklist.items.filter((i) => !hidden.has(i.id))
  const done = items.filter((i) => i.checked).length
  let section = ''

  return (
    <div className="mx-auto max-w-3xl space-y-5 bg-white p-6 text-black print:p-0">
      <div className="flex items-center justify-between print:hidden">
        <Link href={`/checklists/${id}`} className="text-sm text-blue-700 hover:underline">
          ← Back to checklist
        </Link>
        <PrintButton />
      </div>

      <header className="border-b border-gray-400 pb-3">
        <h1 className="text-2xl font-bold">{checklist.title}</h1>
        {checklist.description && <p className="mt-1 text-sm">{checklist.description}</p>}
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <div><dt className="inline font-semibold">Status: </dt><dd className="inline">{checklist.status === 'completed' ? 'Completed' : 'In progress'} ({done}/{items.length})</dd></div>
          {checklist.dueDate && <div><dt className="inline font-semibold">Due: </dt><dd className="inline">{when(checklist.dueDate)}</dd></div>}
          <div><dt className="inline font-semibold">Created by: </dt><dd className="inline">{checklist.createdBy.name}</dd></div>
          {checklist.assignedTo && <div><dt className="inline font-semibold">Assigned to: </dt><dd className="inline">{checklist.assignedTo.name}</dd></div>}
          {checklist.completedAt && <div><dt className="inline font-semibold">Completed: </dt><dd className="inline">{when(checklist.completedAt)}</dd></div>}
          {checklist.signedOffAt && (
            <div><dt className="inline font-semibold">Signed off: </dt><dd className="inline">{checklist.signedOffByName}, {when(checklist.signedOffAt)}</dd></div>
          )}
          {checklist.requiresSignOff && !checklist.signedOffAt && (
            <div><dt className="inline font-semibold">Sign-off: </dt><dd className="inline">not yet approved</dd></div>
          )}
        </dl>
        {checklist.signOffNote && <p className="mt-2 text-sm italic">Sign-off note: {checklist.signOffNote}</p>}
        {checklist.fieldValues.filter((f) => f.value).length > 0 && (
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
            {checklist.fieldValues.filter((f) => f.value).map((f) => (
              <div key={f.id}><dt className="inline font-semibold">{f.name}: </dt><dd className="inline">{f.value}</dd></div>
            ))}
          </dl>
        )}
      </header>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-400 text-left">
            <th className="w-6 py-1" />
            <th className="py-1">Item</th>
            <th className="py-1">Result</th>
            <th className="py-1">Done by</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const heading = item.section !== section ? item.section : ''
            section = item.section
            return (
              <Fragment key={item.id}>
                {heading && (
                  <tr className="break-after-avoid">
                    <td colSpan={4} className="pt-3 font-semibold">{heading}</td>
                  </tr>
                )}
                <tr className="break-inside-avoid border-b border-gray-200 align-top">
                  <td className="py-1.5">{item.checked ? '☑' : '☐'}</td>
                  <td className={`py-1.5 ${item.indent ? 'pl-5' : ''}`}>
                    {item.text}
                    {item.notes && <div className="text-xs italic text-gray-700">{item.notes}</div>}
                  </td>
                  <td className="py-1.5">{RESULT_LABEL[item.result] ?? ''}</td>
                  <td className="py-1.5 text-xs">
                    {item.checkedByName}
                    {item.checkedAt && <div className="text-gray-600">{when(item.checkedAt)}</div>}
                  </td>
                </tr>
              </Fragment>
            )
          })}
        </tbody>
      </table>
      <p className="text-xs text-gray-600">Printed {when(new Date())} by {session.user.name}.</p>
    </div>
  )
}
