'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Download,
  MessageSquare,
  Paperclip,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  User as UserIcon,
} from 'lucide-react'
import type { ApiChecklist, ApiChecklistItem, ApiUser } from '@/lib/types'
import { cn } from '@/lib/utils'

export function ChecklistDetailClient({ checklistId }: { checklistId: string }) {
  const router = useRouter()
  const [checklist, setChecklist] = useState<ApiChecklist | null>(null)
  const [users, setUsers] = useState<ApiUser[]>([])
  const [loading, setLoading] = useState(true)
  const [newItemText, setNewItemText] = useState('')
  const [justCompleted, setJustCompleted] = useState(false)

  const load = useCallback(async () => {
    const [clRes, uRes] = await Promise.all([
      fetch(`/api/checklists/${checklistId}`),
      fetch('/api/users'),
    ])
    if (clRes.ok) setChecklist((await clRes.json()).checklist)
    if (uRes.ok) setUsers((await uRes.json()).users)
    setLoading(false)
  }, [checklistId])

  useEffect(() => {
    load()
  }, [load])

  async function patchChecklist(data: Record<string, unknown>) {
    const res = await fetch(`/api/checklists/${checklistId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (res.ok) setChecklist((await res.json()).checklist)
  }

  async function toggleItem(item: ApiChecklistItem) {
    const res = await fetch(`/api/checklists/${checklistId}/items/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ checked: !item.checked }),
    })
    if (res.ok) {
      const data = await res.json()
      if (data.checklistCompleted) setJustCompleted(true)
      load()
    }
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault()
    const text = newItemText.trim()
    if (!text) return
    const res = await fetch(`/api/checklists/${checklistId}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    if (res.ok) {
      setNewItemText('')
      load()
    }
  }

  async function resetChecklist() {
    if (!checklist) return
    if (!confirm(`Reset "${checklist.title}"? All items will be unchecked.`)) return
    const res = await fetch(`/api/checklists/${checklistId}/reset`, { method: 'POST' })
    if (res.ok) {
      setJustCompleted(false)
      setChecklist((await res.json()).checklist)
    }
  }

  async function removeChecklist() {
    if (!checklist) return
    if (!confirm(`Delete "${checklist.title}"? This cannot be undone.`)) return
    await fetch(`/api/checklists/${checklistId}`, { method: 'DELETE' })
    router.push('/')
  }

  if (loading) {
    return <p className="py-12 text-center text-sm text-slate-400">Loading…</p>
  }
  if (!checklist) {
    return (
      <div className="py-12 text-center text-sm text-slate-400">
        Checklist not found.{' '}
        <Link href="/" className="text-blue-600 hover:underline">
          Back to dashboard
        </Link>
      </div>
    )
  }

  const done = checklist.items.filter((i) => i.checked).length
  const total = checklist.items.length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const completed = checklist.status === 'completed'

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/" className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="h-4 w-4" /> All checklists
      </Link>

      {completed && checklist.nextInstanceId && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <RefreshCw className="h-4 w-4 shrink-0" />
          <span>
            {justCompleted ? 'All done! The' : 'The'}{' '}
            {checklist.recurrence !== 'none' ? `next ${checklist.recurrence} instance` : 'next run'}{' '}
            has been created.{' '}
            <Link
              href={`/checklists/${checklist.nextInstanceId}`}
              className="font-semibold underline"
            >
              Open it
            </Link>
          </span>
        </div>
      )}

      {completed && !checklist.nextInstanceId && (
        <RunAgainPanel checklistId={checklistId} justCompleted={justCompleted} />
      )}

      {/* Header card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className={cn('text-xl font-semibold', completed && 'text-slate-400 line-through')}>
              {checklist.title}
            </h1>
            {checklist.description && (
              <p className="mt-1 text-sm text-slate-500">{checklist.description}</p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              <span className="rounded bg-slate-100 px-1.5 py-0.5">{checklist.category}</span>
              {checklist.recurrence !== 'none' && (
                <span className="flex items-center gap-1 text-blue-600">
                  <RefreshCw className="h-3 w-3" /> repeats {checklist.recurrence}
                </span>
              )}
              {checklist.template && <span>from “{checklist.template.title}”</span>}
              <span>created by {checklist.createdBy.name}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {(done > 0 || completed) && (
              <button
                onClick={resetChecklist}
                className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
                title="Uncheck all items and reopen"
              >
                <RotateCcw className="h-4 w-4" /> Reset
              </button>
            )}
            {completed ? (
              <button
                onClick={() => patchChecklist({ status: 'active' })}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Reopen
              </button>
            ) : (
              <button
                onClick={() => patchChecklist({ status: 'completed' })}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                <CheckCircle2 className="h-4 w-4" /> Complete
              </button>
            )}
            <button
              onClick={removeChecklist}
              className="rounded-lg p-2 text-red-400 hover:bg-red-50"
              title="Delete checklist"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Meta controls */}
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="block text-sm">
            <span className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-500">
              <Calendar className="h-3 w-3" /> Due date
            </span>
            <input
              type="date"
              value={checklist.dueDate ? checklist.dueDate.slice(0, 10) : ''}
              onChange={(e) =>
                patchChecklist({
                  dueDate: e.target.value
                    ? new Date(`${e.target.value}T00:00:00`).toISOString()
                    : null,
                })
              }
              className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 flex items-center gap-1 text-xs font-medium text-slate-500">
              <UserIcon className="h-3 w-3" /> Assigned to
            </span>
            <select
              value={checklist.assignedTo?.id ?? ''}
              onChange={(e) => patchChecklist({ assignedToId: e.target.value || null })}
              className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="">Unassigned</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-500">Priority</span>
            <select
              value={checklist.priority}
              onChange={(e) => patchChecklist({ priority: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
        </div>

        {/* Custom fields */}
        {checklist.fieldValues.length > 0 && (
          <div className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-3">
            {checklist.fieldValues.map((fv) => (
              <label key={fv.id} className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-slate-500">{fv.name}</span>
                {fv.type === 'user' ? (
                  <select
                    value={fv.value}
                    onChange={(e) =>
                      patchChecklist({ fieldValues: [{ id: fv.id, value: e.target.value }] })
                    }
                    className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  >
                    <option value="">—</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.name}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    defaultValue={fv.value}
                    onBlur={(e) => {
                      if (e.target.value !== fv.value) {
                        patchChecklist({ fieldValues: [{ id: fv.id, value: e.target.value }] })
                      }
                    }}
                    className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                  />
                )}
              </label>
            ))}
          </div>
        )}

        {total > 0 && (
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-xs text-slate-400">
              <span>
                {done}/{total} done
              </span>
              <span>{pct}%</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100">
              <div
                className={cn('h-2 rounded-full', pct === 100 ? 'bg-emerald-500' : 'bg-blue-500')}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Items */}
      <div className="space-y-2">
        {checklist.items.map((item) => (
          <ItemRow
            key={item.id}
            checklistId={checklistId}
            item={item}
            users={users}
            onToggle={() => toggleItem(item)}
            onChanged={load}
          />
        ))}

        <form onSubmit={addItem} className="flex gap-2">
          <input
            value={newItemText}
            onChange={(e) => setNewItemText(e.target.value)}
            placeholder="Add an item…"
            className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={!newItemText.trim()}
            className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Add
          </button>
        </form>
      </div>
    </div>
  )
}

const RECURRENCES = ['none', 'daily', 'weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly']

function RunAgainPanel({
  checklistId,
  justCompleted,
}: {
  checklistId: string
  justCompleted: boolean
}) {
  const router = useRouter()
  const [dueDate, setDueDate] = useState('')
  const [recurrence, setRecurrence] = useState('none')
  const [busy, setBusy] = useState(false)

  async function runAgain(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const res = await fetch(`/api/checklists/${checklistId}/run-again`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dueDate: dueDate ? new Date(`${dueDate}T00:00:00`).toISOString() : null,
          recurrence,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        router.push(`/checklists/${data.id}`)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={runAgain}
      className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900"
    >
      <p className="font-medium">
        {justCompleted ? 'All done! ' : ''}Run this checklist again?
      </p>
      <p className="mt-0.5 text-xs text-blue-700">
        Creates a fresh copy with every item unchecked — the completed one stays for your records.
      </p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-blue-700">Next due date</span>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="rounded-lg border border-blue-300 bg-white px-2 py-1.5 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-blue-700">Then repeats</span>
          <select
            value={recurrence}
            onChange={(e) => setRecurrence(e.target.value)}
            className="rounded-lg border border-blue-300 bg-white px-2 py-1.5 text-sm"
          >
            {RECURRENCES.map((r) => (
              <option key={r} value={r}>
                {r === 'none' ? 'Does not repeat' : r}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={busy}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <RefreshCw className="h-4 w-4" /> {busy ? 'Creating…' : 'Create next checklist'}
        </button>
      </div>
    </form>
  )
}

function ItemRow({
  checklistId,
  item,
  users,
  onToggle,
  onChanged,
}: {
  checklistId: string
  item: ApiChecklistItem
  users: ApiUser[]
  onToggle: () => void
  onChanged: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [notes, setNotes] = useState(item.notes)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function patchItem(data: Record<string, unknown>) {
    await fetch(`/api/checklists/${checklistId}/items/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    onChanged()
  }

  async function removeItem() {
    if (!confirm(`Delete item "${item.text}"?`)) return
    await fetch(`/api/checklists/${checklistId}/items/${item.id}`, { method: 'DELETE' })
    onChanged()
  }

  async function uploadFile(file: File) {
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`/api/checklists/${checklistId}/items/${item.id}/attachments`, {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(data.error ?? 'Upload failed')
      }
      onChanged()
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function deleteAttachment(attachmentId: string) {
    await fetch(`/api/attachments/${attachmentId}`, { method: 'DELETE' })
    onChanged()
  }

  const hasExtras = item.notes || item.attachments.length > 0 || item.assignedTo

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center gap-3 px-4 py-3">
        <input
          type="checkbox"
          checked={item.checked}
          onChange={onToggle}
          className="h-5 w-5 shrink-0 accent-blue-600"
        />
        <div className="min-w-0 flex-1">
          <p className={cn('text-sm', item.checked && 'text-slate-400 line-through')}>
            {item.text}
          </p>
          {item.checked && item.checkedByName && (
            <p className="text-[11px] text-slate-400">
              {item.checkedByName}
              {item.checkedAt && ` · ${new Date(item.checkedAt).toLocaleString()}`}
            </p>
          )}
        </div>

        {item.priority && (
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[11px] font-semibold',
              item.priority === 'high' && 'bg-red-100 text-red-700',
              item.priority === 'medium' && 'bg-amber-100 text-amber-700',
              item.priority === 'low' && 'bg-slate-100 text-slate-600'
            )}
          >
            {item.priority}
          </span>
        )}

        <button
          onClick={() => setExpanded((v) => !v)}
          className={cn(
            'flex items-center gap-1 rounded p-1.5 text-xs',
            hasExtras ? 'text-blue-600' : 'text-slate-400',
            'hover:bg-slate-100'
          )}
          title="Notes, attachments, assignee"
        >
          <MessageSquare className="h-4 w-4" />
          {item.attachments.length > 0 && (
            <>
              <Paperclip className="h-3.5 w-3.5" />
              {item.attachments.length}
            </>
          )}
        </button>
        <button onClick={removeItem} className="rounded p-1.5 text-red-300 hover:bg-red-50">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {expanded && (
        <div className="space-y-3 border-t border-slate-100 px-4 py-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-500">Assigned to</span>
              <select
                value={item.assignedTo?.id ?? ''}
                onChange={(e) => patchItem({ assignedToId: e.target.value || null })}
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              >
                <option value="">Unassigned</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-slate-500">Priority</span>
              <select
                value={item.priority ?? ''}
                onChange={(e) => patchItem({ priority: e.target.value || null })}
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              >
                <option value="">None</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-500">Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => {
                if (notes !== item.notes) patchItem({ notes })
              }}
              rows={2}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <div>
            <span className="mb-1 block text-xs font-medium text-slate-500">Attachments</span>
            {item.attachments.map((a) => (
              <div key={a.id} className="flex items-center gap-2 py-1 text-sm">
                <Paperclip className="h-3.5 w-3.5 text-slate-400" />
                <span className="min-w-0 flex-1 truncate">{a.fileName}</span>
                <span className="text-xs text-slate-400">{Math.ceil(a.size / 1024)} KB</span>
                <a
                  href={`/api/attachments/${a.id}`}
                  className="rounded p-1 text-blue-500 hover:bg-blue-50"
                  title="Download"
                >
                  <Download className="h-4 w-4" />
                </a>
                <button
                  onClick={() => deleteAttachment(a.id)}
                  className="rounded p-1 text-red-300 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <input
              ref={fileRef}
              type="file"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) uploadFile(file)
              }}
              disabled={uploading}
              className="mt-1 block w-full text-xs text-slate-500 file:mr-2 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-medium hover:file:bg-slate-200"
            />
            {uploading && <p className="mt-1 text-xs text-slate-400">Uploading…</p>}
          </div>
        </div>
      )}
    </div>
  )
}
