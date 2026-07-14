'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Download,
  Lock,
  MessageSquare,
  Paperclip,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  User as UserIcon,
  Users as UsersIcon,
} from 'lucide-react'
import type { ApiChecklist, ApiChecklistItem, ApiUser } from '@/lib/types'
import { cn } from '@/lib/utils'

export function ChecklistDetailClient({
  checklistId,
  currentUserId,
  currentUserRole,
}: {
  checklistId: string
  currentUserId: string
  currentUserRole: string
}) {
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
    return <p className="py-12 text-center text-sm text-faint">Loading…</p>
  }
  if (!checklist) {
    return (
      <div className="py-12 text-center text-sm text-faint">
        Checklist not found.{' '}
        <Link href="/" className="text-accent hover:underline">
          Back to dashboard
        </Link>
      </div>
    )
  }

  const done = checklist.items.filter((i) => i.checked).length
  const total = checklist.items.length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const completed = checklist.status === 'completed'
  const canManage =
    currentUserRole === 'admin' ||
    currentUserRole === 'manager' ||
    checklist.createdBy.id === currentUserId

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link href="/" className="flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> All checklists
      </Link>

      {completed && checklist.nextInstanceId && (
        <div className="flex items-center gap-2 rounded-xl border border-ok/30 bg-ok-soft px-4 py-3 text-sm text-ok">
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
      <div className="rounded-2xl border border-border bg-panel p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className={cn('text-xl font-semibold', completed && 'text-faint line-through')}>
              {checklist.title}
            </h1>
            {checklist.description && (
              <p className="mt-1 text-sm text-muted">{checklist.description}</p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              <span className="rounded bg-hover px-1.5 py-0.5">{checklist.category}</span>
              {checklist.visibility === 'private' && (
                <span className="flex items-center gap-1">
                  <Lock className="h-3 w-3" /> private
                </span>
              )}
              {checklist.recurrence !== 'none' && (
                <span className="flex items-center gap-1 text-accent">
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
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted hover:bg-hover"
                title="Uncheck all items and reopen"
              >
                <RotateCcw className="h-4 w-4" /> Reset
              </button>
            )}
            {completed ? (
              <button
                onClick={() => patchChecklist({ status: 'active' })}
                className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted hover:bg-hover"
              >
                Reopen
              </button>
            ) : (
              <button
                onClick={() => patchChecklist({ status: 'completed' })}
                className="flex items-center gap-1.5 rounded-lg bg-ok px-3 py-1.5 text-sm font-semibold text-accent-ink hover:opacity-90"
              >
                <CheckCircle2 className="h-4 w-4" /> Complete
              </button>
            )}
            <button
              onClick={removeChecklist}
              className="rounded-lg p-2 text-danger/60 hover:bg-danger-soft hover:text-danger"
              title="Delete checklist"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Meta controls */}
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <label className="block text-sm">
            <span className="mb-1 flex items-center gap-1 text-xs font-medium text-muted">
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
              className="w-full rounded-lg border border-border bg-field px-2 py-1.5 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 flex items-center gap-1 text-xs font-medium text-muted">
              <UserIcon className="h-3 w-3" /> Assigned to
            </span>
            <select
              value={checklist.assignedTo?.id ?? ''}
              onChange={(e) => patchChecklist({ assignedToId: e.target.value || null })}
              className="w-full rounded-lg border border-border bg-field px-2 py-1.5 text-sm"
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
            <span className="mb-1 block text-xs font-medium text-muted">Priority</span>
            <select
              value={checklist.priority}
              onChange={(e) => patchChecklist({ priority: e.target.value })}
              className="w-full rounded-lg border border-border bg-field px-2 py-1.5 text-sm"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
        </div>

        {/* Custom fields */}
        {checklist.fieldValues.length > 0 && (
          <div className="mt-4 grid gap-3 border-t border-border-soft pt-4 sm:grid-cols-3">
            {checklist.fieldValues.map((fv) => (
              <label key={fv.id} className="block text-sm">
                <span className="mb-1 block text-xs font-medium text-muted">{fv.name}</span>
                {fv.type === 'user' ? (
                  <select
                    value={fv.value}
                    onChange={(e) =>
                      patchChecklist({ fieldValues: [{ id: fv.id, value: e.target.value }] })
                    }
                    className="w-full rounded-lg border border-border bg-field px-2 py-1.5 text-sm"
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
                    className="w-full rounded-lg border border-border bg-field px-2 py-1.5 text-sm"
                  />
                )}
              </label>
            ))}
          </div>
        )}

        {total > 0 && (
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-xs text-faint">
              <span>
                {done}/{total} done
              </span>
              <span>{pct}%</span>
            </div>
            <div className="h-2 rounded-full bg-hover">
              <div
                className={cn('h-2 rounded-full', pct === 100 ? 'bg-ok' : 'bg-accent')}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Visibility & sharing (creator, managers, admins) */}
      {canManage && (
        <SharingPanel
          checklist={checklist}
          users={users}
          currentUserId={currentUserId}
          onSave={patchChecklist}
        />
      )}

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
            className="flex-1 rounded-lg border border-border bg-field px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={!newItemText.trim()}
            className="flex items-center gap-1 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-2 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Add
          </button>
        </form>
      </div>
    </div>
  )
}

function SharingPanel({
  checklist,
  users,
  currentUserId,
  onSave,
}: {
  checklist: ApiChecklist
  users: ApiUser[]
  currentUserId: string
  onSave: (data: Record<string, unknown>) => Promise<void>
}) {
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState(false)
  const sharedIds = new Set(checklist.shares.map((s) => s.user.id))
  const shareable = users.filter((u) => u.id !== currentUserId)

  async function toggleShare(userId: string) {
    const next = new Set(sharedIds)
    if (next.has(userId)) next.delete(userId)
    else next.add(userId)
    setBusy(true)
    try {
      await onSave({ sharedUserIds: Array.from(next) })
    } finally {
      setBusy(false)
    }
  }

  async function setVisibility(visibility: string) {
    setBusy(true)
    try {
      await onSave({ visibility })
    } finally {
      setBusy(false)
    }
  }

  const isPrivate = checklist.visibility === 'private'

  return (
    <div className="rounded-2xl border border-border bg-panel">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-5 py-3 text-sm font-medium text-ink"
      >
        {isPrivate ? <Lock className="h-4 w-4 text-muted" /> : <UsersIcon className="h-4 w-4 text-muted" />}
        Visibility & sharing
        <span className="ml-auto text-xs font-normal text-faint">
          {isPrivate
            ? `Private${sharedIds.size > 0 ? ` · shared with ${sharedIds.size}` : ''}`
            : 'Team — everyone can see it'}
        </span>
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-border-soft px-5 py-4">
          <div className="flex gap-2">
            {[
              { value: 'team', label: 'Team', hint: 'Everyone signed in' },
              { value: 'private', label: 'Private', hint: 'Only you, assignees & shared users' },
            ].map((v) => (
              <button
                key={v.value}
                onClick={() => setVisibility(v.value)}
                disabled={busy || checklist.visibility === v.value}
                className={cn(
                  'flex-1 rounded-lg border p-2.5 text-left text-sm',
                  checklist.visibility === v.value
                    ? 'border-accent bg-accent-soft'
                    : 'border-border hover:bg-hover'
                )}
              >
                <span className="block font-medium">{v.label}</span>
                <span className="block text-xs text-faint">{v.hint}</span>
              </button>
            ))}
          </div>

          {isPrivate && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted">
                Share with specific people (they get notified)
              </p>
              {shareable.length === 0 ? (
                <p className="text-xs text-faint">No other users yet.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {shareable.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => toggleShare(u.id)}
                      disabled={busy}
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-xs font-medium',
                        sharedIds.has(u.id)
                          ? 'border-accent bg-accent-soft text-accent'
                          : 'border-border text-muted hover:bg-hover'
                      )}
                    >
                      {u.name}
                    </button>
                  ))}
                </div>
              )}
              <p className="mt-2 text-[11px] text-faint">
                Managers and admins can always see every checklist.
              </p>
            </div>
          )}
        </div>
      )}
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
      className="rounded-xl border border-accent/30 bg-accent-soft px-4 py-3 text-sm text-ink"
    >
      <p className="font-medium">
        {justCompleted ? 'All done! ' : ''}Run this checklist again?
      </p>
      <p className="mt-0.5 text-xs text-muted">
        Creates a fresh copy with every item unchecked — the completed one stays for your records.
      </p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Next due date</span>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="rounded-lg border border-border bg-field px-2 py-1.5 text-sm"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted">Then repeats</span>
          <select
            value={recurrence}
            onChange={(e) => setRecurrence(e.target.value)}
            className="rounded-lg border border-border bg-field px-2 py-1.5 text-sm"
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
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-ink hover:bg-accent-2 disabled:opacity-50"
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
    <div className="rounded-xl border border-border bg-panel">
      <div className="flex items-center gap-3 px-4 py-3">
        <input
          type="checkbox"
          checked={item.checked}
          onChange={onToggle}
          className="h-5 w-5 shrink-0 accent-accent"
        />
        <div className="min-w-0 flex-1">
          <p className={cn('text-sm', item.checked && 'text-faint line-through')}>
            {item.text}
          </p>
          {item.checked && item.checkedByName && (
            <p className="text-[11px] text-faint">
              {item.checkedByName}
              {item.checkedAt && ` · ${new Date(item.checkedAt).toLocaleString()}`}
            </p>
          )}
        </div>

        {item.priority && (
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[11px] font-semibold',
              item.priority === 'high' && 'bg-danger-soft text-danger',
              item.priority === 'medium' && 'bg-warn-soft text-warn',
              item.priority === 'low' && 'bg-hover text-muted'
            )}
          >
            {item.priority}
          </span>
        )}

        <button
          onClick={() => setExpanded((v) => !v)}
          className={cn(
            'flex items-center gap-1 rounded p-1.5 text-xs',
            hasExtras ? 'text-accent' : 'text-faint',
            'hover:bg-hover'
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
        <button
          onClick={removeItem}
          className="rounded p-1.5 text-danger/50 hover:bg-danger-soft hover:text-danger"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {expanded && (
        <div className="space-y-3 border-t border-border-soft px-4 py-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-muted">Assigned to</span>
              <select
                value={item.assignedTo?.id ?? ''}
                onChange={(e) => patchItem({ assignedToId: e.target.value || null })}
                className="w-full rounded-lg border border-border bg-field px-2 py-1.5 text-sm"
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
              <span className="mb-1 block text-xs font-medium text-muted">Priority</span>
              <select
                value={item.priority ?? ''}
                onChange={(e) => patchItem({ priority: e.target.value || null })}
                className="w-full rounded-lg border border-border bg-field px-2 py-1.5 text-sm"
              >
                <option value="">None</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-muted">Notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={() => {
                if (notes !== item.notes) patchItem({ notes })
              }}
              rows={2}
              className="w-full rounded-lg border border-border bg-field px-3 py-2 text-sm"
            />
          </label>

          <div>
            <span className="mb-1 block text-xs font-medium text-muted">Attachments</span>
            {item.attachments.map((a) => (
              <div key={a.id} className="flex items-center gap-2 py-1 text-sm">
                <Paperclip className="h-3.5 w-3.5 text-faint" />
                <span className="min-w-0 flex-1 truncate">{a.fileName}</span>
                <span className="text-xs text-faint">{Math.ceil(a.size / 1024)} KB</span>
                <a
                  href={`/api/attachments/${a.id}`}
                  className="rounded p-1 text-accent hover:bg-accent-soft"
                  title="Download"
                >
                  <Download className="h-4 w-4" />
                </a>
                <button
                  onClick={() => deleteAttachment(a.id)}
                  className="rounded p-1 text-danger/50 hover:bg-danger-soft hover:text-danger"
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
              className="mt-1 block w-full text-xs text-muted file:mr-2 file:rounded-lg file:border-0 file:bg-hover file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-ink hover:file:bg-border-soft"
            />
            {uploading && <p className="mt-1 text-xs text-faint">Uploading…</p>}
          </div>
        </div>
      )}
    </div>
  )
}
