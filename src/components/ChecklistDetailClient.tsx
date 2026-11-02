'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Bell,
  Calendar,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CloudOff,
  Download,
  GripVertical,
  History,
  Lock,
  MessageSquare,
  Paperclip,
  PenLine,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  X,
  Trash2,
  User as UserIcon,
  Users as UsersIcon,
} from 'lucide-react'
import type { ApiActivity, ApiChecklist, ApiChecklistItem, ApiComment, ApiUser } from '@/lib/types'
import { DepartmentPicker } from '@/components/DepartmentPicker'
import { useHelpTags } from '@/components/HelpMenu'
import { cn } from '@/lib/utils'
import { hiddenItemIds } from '@/lib/conditions'
import { ITEM_KINDS, ITEM_KIND_LABELS, parseNumber, rangeLabel } from '@/lib/item-types'
import { QUEUE_EVENT, applyPending, flushQueue, pendingChanges, saveItemChange } from '@/lib/offline-queue'

// ChecklistItem.dueDate is new in the schema; ApiChecklistItem doesn't declare it yet.
type ItemWithDue = ApiChecklistItem & { dueDate?: string | null }

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
  const [dragId, setDragId] = useState<string | null>(null)
  const [pollTick, setPollTick] = useState(0)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const wide = useWideScreen()
  const [sideWidth, setSideWidth] = useState(480)
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(SIDE_WIDTH_KEY))
      if (saved >= SIDE_MIN && saved <= SIDE_MAX) setSideWidth(saved)
    } catch {}
  }, [])

  function startResize(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = sideWidth
    let latest = startWidth
    const move = (ev: PointerEvent) => {
      latest = Math.min(SIDE_MAX, Math.max(SIDE_MIN, startWidth + (startX - ev.clientX)))
      setSideWidth(latest)
    }
    const up = () => {
      window.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      try { localStorage.setItem(SIDE_WIDTH_KEY, String(latest)) } catch {}
    }
    window.addEventListener("pointermove", move)
    window.addEventListener("pointerup", up)
  }
  const dragIdRef = useRef<string | null>(null)
  dragIdRef.current = dragId

  function toggleSection(name: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (!next.delete(name)) next.add(name)
      return next
    })
  }

  // The last copy from the server; what's shown is this plus any changes still
  // waiting on this device to be sent.
  const serverCopy = useRef<ApiChecklist | null>(null)
  const [online, setOnline] = useState(true)
  const [pendingCount, setPendingCount] = useState(0)

  const showWithPending = useCallback(() => {
    setPendingCount(pendingChanges(currentUserId).length)
    const base = serverCopy.current
    if (base) setChecklist({ ...base, items: applyPending(base.items, pendingChanges(currentUserId, checklistId)) })
  }, [checklistId, currentUserId])

  const setFromServer = useCallback(
    (cl: ApiChecklist) => {
      serverCopy.current = cl
      showWithPending()
    },
    [showWithPending]
  )

  const load = useCallback(async () => {
    try {
      const [clRes, uRes] = await Promise.all([
        fetch(`/api/checklists/${checklistId}`),
        fetch('/api/users'),
      ])
      if (clRes.ok) serverCopy.current = (await clRes.json()).checklist
      if (uRes.ok) setUsers((await uRes.json()).users)
    } catch {
      // Offline with nothing cached: keep showing the last copy.
    }
    showWithPending()
    setLoading(false)
  }, [checklistId, showWithPending])

  // Send changes made offline, then refresh. Changes the server refuses (the list
  // was locked or the item deleted meanwhile) are dropped and reported.
  const sync = useCallback(async () => {
    if (pendingChanges(currentUserId).length > 0) {
      const result = await flushQueue(currentUserId)
      if (result.rejected.length > 0) {
        const reasons = [...new Set(result.rejected.map((r) => r.error))].join('\n')
        alert(
          `${result.rejected.length} change${result.rejected.length === 1 ? '' : 's'} made offline couldn't be saved:\n${reasons}`
        )
      }
    }
    await load()
  }, [currentUserId, load])

  useEffect(() => {
    sync()
  }, [sync])

  useEffect(() => {
    setOnline(navigator.onLine)
    const goOnline = () => {
      setOnline(true)
      sync()
    }
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    window.addEventListener(QUEUE_EVENT, showWithPending)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      window.removeEventListener(QUEUE_EVENT, showWithPending)
    }
  }, [sync, showWithPending])

  // Auto-refresh: poll while the tab is visible, but never clobber
  // in-progress edits — skip while dragging or while the user is focused
  // in a text field; the next poll catches up.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'visible') return
      if (dragIdRef.current) return
      const el = document.activeElement
      if (
        el &&
        (el.tagName === 'TEXTAREA' ||
          el.tagName === 'SELECT' ||
          (el instanceof HTMLInputElement && el.type !== 'checkbox'))
      ) {
        return
      }
      sync()
      setPollTick((t) => t + 1)
    }
    const interval = setInterval(refresh, 20_000)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [sync])

  async function patchChecklist(data: Record<string, unknown>) {
    const res = await fetch(`/api/checklists/${checklistId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (res.ok) setFromServer((await res.json()).checklist)
  }

  // Change an item, from its row or its details. A photo-required item without a
  // photo opens its details so the photo can be added. With no connection the
  // change is kept on this device and sent later.
  async function updateItem(item: ApiChecklistItem, data: Record<string, unknown>) {
    const result = await saveItemChange({ userId: currentUserId, checklistId, itemId: item.id, data })
    if (result.status === 'rejected') {
      alert(result.error)
      if (item.photoRequired) showItem(item)
    } else if (result.status === 'saved' && result.body.checklistCompleted) setJustCompleted(true)
    // Queued behind earlier offline changes while online: send them all now.
    if (result.status === 'queued' && navigator.onLine) await sync()
    else await load()
  }

  async function markAll(mode: 'tick' | 'pass' | 'na') {
    const label = mode === 'tick' ? 'tick' : `mark ${mode === 'na' ? 'N/A' : 'Pass'}`
    if (!confirm(`${label[0].toUpperCase()}${label.slice(1)} every remaining item on this list?`)) return
    const res = await fetch(`/api/checklists/${checklistId}/items/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    })
    if (res.ok) {
      const data = await res.json()
      if (data.checklistCompleted) setJustCompleted(true)
      if (data.skipped > 0) {
        alert(
          `${data.skipped} item${data.skipped === 1 ? '' : 's'} still need${data.skipped === 1 ? 's' : ''} a reading, answer, signature or photo, so ${data.skipped === 1 ? 'it was' : 'they were'} left for you to do.`
        )
      }
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
      setFromServer((await res.json()).checklist)
    }
  }

  function dragOverItem(e: React.DragEvent, overId: string) {
    e.preventDefault()
    if (!dragId || dragId === overId || !checklist) return
    const items = [...checklist.items]
    const from = items.findIndex((i) => i.id === dragId)
    const to = items.findIndex((i) => i.id === overId)
    if (from < 0 || to < 0) return
    const [moved] = items.splice(from, 1)
    items.splice(to, 0, moved)
    setChecklist({ ...checklist, items })
  }

  async function dropItem() {
    if (!dragId || !checklist) return
    setDragId(null)
    const res = await fetch(`/api/checklists/${checklistId}/items/reorder`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemIds: checklist.items.map((i) => i.id) }),
    })
    if (!res.ok) load() // restore server order if the reorder was rejected
  }

  async function saveAsTemplate() {
    const res = await fetch(`/api/checklists/${checklistId}/save-as-template`, { method: 'POST' })
    if (res.ok) {
      alert('Saved as a template. Find it under Templates.')
    } else {
      alert('Could not save as a template.')
    }
  }

  // Jump to an item from the corrective-action banner: open its section and details.
  function showItem(item: ApiChecklistItem) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      next.delete(item.section)
      return next
    })
    setSelectedId(item.id)
    requestAnimationFrame(() =>
      document.getElementById(`item-${item.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    )
  }

  async function signOff(decision: 'approve' | 'reject') {
    const note =
      prompt(decision === 'approve' ? 'Sign-off note (optional):' : 'Why is it being sent back?')?.trim() ?? null
    if (note === null || (decision === 'reject' && !note)) return
    const res = await fetch(`/api/checklists/${checklistId}/sign-off`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision, note }),
    })
    if (!res.ok) alert((await res.json().catch(() => ({}))).error ?? 'Could not record the decision')
    load()
  }

  async function removeChecklist() {
    if (!checklist) return
    if (!confirm(`Delete "${checklist.title}"? This cannot be undone.`)) return
    await fetch(`/api/checklists/${checklistId}`, { method: 'DELETE' })
    router.push('/')
  }

  // Tell the help menu what state this list is in so it can lead with what matters.
  const helpTags: string[] = []
  if (checklist) {
    const isApproverRole = currentUserRole === 'admin' || currentUserRole === 'manager'
    const isDone = checklist.status === 'completed'
    if (isDone) helpTags.push('completed')
    if (isDone && checklist.requiresSignOff) {
      if (checklist.signedOffAt) helpTags.push('signed-off')
      else if (isApproverRole && checklist.completedById !== currentUserId) helpTags.push('can-approve')
      else if (checklist.completedById === currentUserId) helpTags.push('pending-signoff-own')
      else helpTags.push('pending-signoff')
    }
    if (checklist.requiresSignOff) helpTags.push('requires-signoff')
    if (checklist.recurrence !== 'none') helpTags.push('recurring')
    if (!isDone && checklist.dueDate && new Date(checklist.dueDate) < new Date()) helpTags.push('overdue')
    if (isApproverRole || checklist.createdBy.id === currentUserId) helpTags.push('can-manage')
  }
  useHelpTags(helpTags)

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

  const selectedItem = checklist.items.find((i) => i.id === selectedId) ?? null
  // Items behind an unmet condition are out of the list and out of the count.
  const hidden = hiddenItemIds(checklist.items)
  const done = checklist.items.filter((i) => i.checked && !hidden.has(i.id)).length
  const total = checklist.items.length - hidden.size
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  const completed = checklist.status === 'completed'
  const pendingSignOff = completed && checklist.requiresSignOff && !checklist.signedOffAt
  const isApprover = currentUserRole === 'admin' || currentUserRole === 'manager'
  const canApprove = pendingSignOff && isApprover && checklist.completedById !== currentUserId
  const openActions = checklist.items.filter((i) => !hidden.has(i.id) && i.result === 'fail' && !i.actionClosedAt)
  const canManage =
    currentUserRole === 'admin' ||
    currentUserRole === 'manager' ||
    checklist.createdBy.id === currentUserId

  // These sit under the header on narrow screens and in the side column on wide ones.
  const sharingBlock = canManage ? (
    <SharingPanel
      checklist={checklist}
      users={users}
      currentUserId={currentUserId}
      onSave={patchChecklist}
    />
  ) : null
  const docsBlock = (
    <SupportingDocuments
      checklistId={checklistId}
      attachments={checklist.attachments ?? []}
      onChanged={load}
    />
  )
  const commentsBlock = (
    <CommentsActivityPanel checklistId={checklistId} users={users} refreshTick={pollTick} />
  )

  // Due date, reminder, assignee, priority and custom fields.
  const detailsBlock = (
    <div className="space-y-4">
        {/* Meta controls */}
        <div className={cn("grid gap-3", wide ? "grid-cols-2" : "sm:grid-cols-4")}>
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
              <Bell className="h-3 w-3" /> Reminder
            </span>
            <select
              value={checklist.reminderOffsetHours ?? ''}
              onChange={(e) =>
                patchChecklist({
                  reminderOffsetHours: e.target.value ? Number(e.target.value) : null,
                })
              }
              className="w-full rounded-lg border border-border bg-field px-2 py-1.5 text-sm"
              disabled={!checklist.dueDate}
              title="Set reminder offset (requires a due date)"
            >
              <option value="">No reminder</option>
              <option value={1}>1 hour before</option>
              <option value={2}>2 hours before</option>
              <option value={6}>6 hours before</option>
              <option value={12}>12 hours before</option>
              <option value={24}>1 day before</option>
              <option value={48}>2 days before</option>
              <option value={72}>3 days before</option>
            </select>
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
          <div className={cn("grid gap-3 border-t border-border-soft pt-4", wide ? "grid-cols-2" : "sm:grid-cols-3 xl:grid-cols-5")}>
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
    </div>
  )

  const headerCard = (
      <div className="rounded-2xl border border-border bg-panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
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
              {checklist.template && (
                <span>
                  from “{checklist.template.title}”
                  {checklist.templateVersion != null && ` · v${checklist.templateVersion}`}
                </span>
              )}
              <span>created by {checklist.createdBy.name}</span>
              {checklist.signedOffAt && (
                <span className="flex items-center gap-1 text-ok">
                  <ShieldCheck className="h-3 w-3" /> signed off by {checklist.signedOffByName} ·{' '}
                  {new Date(checklist.signedOffAt).toLocaleDateString()}
                  {checklist.signOffNote && ` — ${checklist.signOffNote}`}
                </span>
              )}
              {(canManage || checklist.requiresSignOff) && (
                <label
                  className={cn(
                    'flex items-center gap-1',
                    completed && !isApprover && 'opacity-60'
                  )}
                  title="Require a manager (other than whoever finishes it) to approve this list"
                >
                  <input
                    type="checkbox"
                    checked={checklist.requiresSignOff}
                    disabled={!canManage || (completed && !isApprover)}
                    onChange={(e) => patchChecklist({ requiresSignOff: e.target.checked })}
                    className="h-3.5 w-3.5 accent-accent"
                  />
                  needs sign-off
                </label>
              )}
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
            <Link
              href={`/checklists/${checklistId}/print`}
              className="rounded-lg p-2 text-muted hover:bg-hover hover:text-ink"
              title="Printable record"
            >
              <Printer className="h-4 w-4" />
            </Link>
            <button
              onClick={saveAsTemplate}
              className="rounded-lg p-2 text-muted hover:bg-hover hover:text-ink"
              title="Save as template"
            >
              <Save className="h-4 w-4" />
            </button>
            <button
              onClick={removeChecklist}
              className="rounded-lg p-2 text-danger/60 hover:bg-danger-soft hover:text-danger"
              title="Delete checklist"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {!wide && <div className="mt-4">{detailsBlock}</div>}

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
  )

  return (
    <div
      className={cn("mx-auto", wide ? "grid max-w-none items-start" : "max-w-5xl")}
      style={wide ? { gridTemplateColumns: `minmax(0,1fr) 16px ${sideWidth}px` } : undefined}
    >
    <div className="min-w-0 space-y-4">
      <Link href="/" className="flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> All checklists
      </Link>

      {(!online || pendingCount > 0) && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn">
          <CloudOff className="h-4 w-4 shrink-0" />
          <span className="flex-1">
            {!online && "You're offline. Ticks, answers, results and notes are kept on this device and sent when you're back online. "}
            {pendingCount > 0 &&
              `${pendingCount} change${pendingCount === 1 ? '' : 's'} waiting to sync.`}
          </span>
          {online && pendingCount > 0 && (
            <button
              onClick={() => sync()}
              className="rounded-lg border border-warn/40 px-3 py-1 text-xs font-semibold hover:bg-warn/10"
            >
              Sync now
            </button>
          )}
        </div>
      )}

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

      {pendingSignOff && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          <span className="flex-1">
            {canApprove
              ? openActions.length > 0
                ? 'This list is finished, but its corrective actions must be closed before you can approve it.'
                : 'This list is finished and needs your sign-off.'
              : isApprover && checklist.completedById === currentUserId
                ? 'Awaiting sign-off — another manager must approve it, as you completed it.'
                : 'Awaiting manager sign-off.'}
          </span>
          {canApprove && (
            <div className="flex gap-2">
              <button
                onClick={() => signOff('approve')}
                disabled={openActions.length > 0}
                title={openActions.length > 0 ? 'Close the open corrective actions first' : undefined}
                className="rounded-lg bg-ok px-3 py-1.5 text-sm font-semibold text-accent-ink hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Approve
              </button>
              <button
                onClick={() => signOff('reject')}
                className="rounded-lg border border-danger/40 px-3 py-1.5 text-sm font-semibold text-danger hover:bg-danger-soft"
              >
                Send back
              </button>
            </div>
          )}
        </div>
      )}

      {openActions.length > 0 && (
        <div className="rounded-xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
          <p className="font-medium">
            {openActions.length} open corrective action{openActions.length === 1 ? '' : 's'}
            {checklist.requiresSignOff && ' — sign-off waits until they are closed'}
          </p>
          <ul className="mt-1 space-y-0.5">
            {openActions.map((i) => (
              <li key={i.id}>
                <button type="button" onClick={() => showItem(i)} className="text-left font-medium hover:underline">
                  {i.text}
                </button>
                <span className="text-danger/80">
                  {' — '}
                  {i.actionText || 'no action written yet'}
                  {i.actionAssignedTo ? ` · ${i.actionAssignedTo.name}` : ' · unassigned'}
                  {i.actionDueDate && ` · due ${new Date(i.actionDueDate).toLocaleDateString()}`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {completed && !checklist.nextInstanceId && (
        <RunAgainPanel checklistId={checklistId} justCompleted={justCompleted} />
      )}

      {!wide && headerCard}

      {!wide && sharingBlock}
      {!wide && docsBlock}

      {/* Items */}
      {!completed && total - done > 1 && (
        <div className="flex items-center justify-end gap-1.5 text-xs text-muted">
          <span>Mark all remaining:</span>
          {(['tick', 'pass', 'na'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => markAll(m)}
              className="rounded-lg border border-border px-2 py-1 font-medium uppercase hover:bg-hover"
            >
              {m === 'tick' ? 'Done' : m === 'na' ? 'N/A' : 'Pass'}
            </button>
          ))}
        </div>
      )}
      <div className="space-y-1 md:space-y-1">
        {checklist.items.map((item, idx) => hidden.has(item.id) ? null : (
          <div key={item.id} className={cn('space-y-1', item.indent > 0 && 'ml-8')}>
            {item.section && item.section !== (checklist.items[idx - 1]?.section ?? '') && (
              <button
                type="button"
                onClick={() => toggleSection(item.section)}
                className="flex w-full items-center gap-1 pt-3 text-left text-sm font-semibold text-muted hover:text-ink"
              >
                {collapsed.has(item.section) ? (
                  <ChevronRight className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
                <span>{item.section}</span>
                <span className="ml-1 text-xs font-normal text-faint">
                  {checklist.items.filter((i) => i.section === item.section && i.checked).length}/
                  {checklist.items.filter((i) => i.section === item.section).length}
                </span>
              </button>
            )}
            {!(item.section && collapsed.has(item.section)) && (
            <ItemRow
              checklistId={checklistId}
              item={item}
              users={users}
              earlier={checklist.items.slice(0, idx)}
              wide={wide}
              selected={selectedId === item.id}
              onSelect={() => setSelectedId((cur) => (cur === item.id ? null : item.id))}
              onUpdate={(data) => updateItem(item, data)}
              onChanged={load}
              dragging={dragId === item.id}
              onDragStart={() => setDragId(item.id)}
              onDragOver={(e) => dragOverItem(e, item.id)}
              onDragEnd={dropItem}
            />
            )}
          </div>
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

      {!wide && commentsBlock}
    </div>

    {wide && (
      <div
        onPointerDown={startResize}
        onDoubleClick={() => { setSideWidth(480); try { localStorage.removeItem(SIDE_WIDTH_KEY) } catch {} }}
        className="group sticky top-20 mx-auto h-[calc(100vh-6rem)] w-4 cursor-col-resize touch-none"
        title="Drag to resize · double-click to reset"
      >
        <div className="mx-auto h-full w-0.5 rounded bg-border group-hover:bg-accent" />
      </div>
    )}
    {wide && (
      <aside className="sticky top-20 max-h-[calc(100vh-6rem)] space-y-4 overflow-y-auto pr-1">
        {headerCard}
        <div className="rounded-2xl border border-border bg-panel p-4">
        {selectedItem ? (
          <>
            <div className="mb-3 flex items-start gap-2">
              <input
                type="checkbox"
                checked={selectedItem.checked}
                onChange={() => updateItem(selectedItem, { checked: !selectedItem.checked })}
                className="mt-0.5 h-5 w-5 shrink-0 accent-accent"
              />
              <h2
                className={cn(
                  'min-w-0 flex-1 break-words text-sm font-semibold',
                  selectedItem.checked && 'text-faint line-through'
                )}
              >
                {selectedItem.text}
              </h2>
              <button
                onClick={() => setSelectedId(null)}
                className="rounded p-1 text-faint hover:bg-hover hover:text-ink"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <ItemDetails
              key={selectedItem.id}
              checklistId={checklistId}
              item={selectedItem}
              users={users}
              earlier={checklist.items.slice(0, Math.max(0, checklist.items.findIndex((i) => i.id === selectedItem.id)))}
              onUpdate={(data) => updateItem(selectedItem, data)}
              onChanged={load}
              panel
            />
          </>
        ) : (
          <p className="py-2 text-center text-sm text-faint">
            Select an item to see its notes, result, assignee and attachments.
          </p>
        )}
        </div>
        <div className="rounded-2xl border border-border bg-panel p-4">{detailsBlock}</div>
        {sharingBlock}
        {docsBlock}
        {commentsBlock}
      </aside>
    )}
    </div>
  )
}

const SIDE_WIDTH_KEY = "lm-side-width"
const SIDE_MIN = 320
const SIDE_MAX = 900

// True on screens wide enough to show item details in a side panel.
function useWideScreen() {
  const [wide, setWide] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1280px)')
    const update = () => setWide(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])
  return wide
}

const ACTION_LABELS: Record<string, string> = {
  created: 'created this checklist',
  item_checked: 'checked off',
  signed_off: 'signed off',
  document_added: 'added a supporting document',
  sign_off_rejected: 'sent back for rework',
  action_closed: 'closed a corrective action',
  action_reopened: 'reopened a corrective action',
  sign_off_setting: 'changed the sign-off setting',
  item_unchecked: 'unchecked',
  item_added: 'added item',
  item_removed: 'removed item',
  completed: 'completed the checklist',
  reopened: 'reopened the checklist',
  reordered: 'reordered the items',
  assigned: 'changed the assignee',
  visibility_changed: 'changed visibility',
  shared: 'updated sharing',
  unshared: 'removed sharing',
  commented: 'left a comment',
  edited: 'edited the details',
}

// Highlight `@Full Name` (or an unambiguous `@First`) tokens of real users.
// Returns plain React nodes — never raw HTML.
function renderBodyWithMentions(body: string, users: ApiUser[]): React.ReactNode {
  if (users.length === 0) return body
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const firstWordCounts = new Map<string, number>()
  for (const u of users) {
    const first = u.name.trim().split(/\s+/)[0].toLowerCase()
    firstWordCounts.set(first, (firstWordCounts.get(first) ?? 0) + 1)
  }
  const tokens = new Set<string>()
  for (const u of users) {
    const full = u.name.trim()
    if (!full) continue
    tokens.add(full)
    const first = full.split(/\s+/)[0]
    if (firstWordCounts.get(first.toLowerCase()) === 1) tokens.add(first)
  }
  if (tokens.size === 0) return body
  const pattern = new RegExp(
    `@(${[...tokens].sort((a, b) => b.length - a.length).map(esc).join('|')})(?!\\w)`,
    'gi'
  )
  const nodes: React.ReactNode[] = []
  let last = 0
  for (const m of body.matchAll(pattern)) {
    if (m.index > last) nodes.push(body.slice(last, m.index))
    nodes.push(
      <span key={m.index} className="rounded bg-accent-soft px-0.5 font-medium text-accent">
        {m[0]}
      </span>
    )
    last = m.index + m[0].length
  }
  if (last === 0) return body
  if (last < body.length) nodes.push(body.slice(last))
  return nodes
}

function CommentsActivityPanel({
  checklistId,
  users,
  refreshTick,
}: {
  checklistId: string
  users: ApiUser[]
  refreshTick: number
}) {
  const [tab, setTab] = useState<'comments' | 'activity'>('comments')
  const [comments, setComments] = useState<ApiComment[]>([])
  const [activities, setActivities] = useState<ApiActivity[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null)
  const [mentionIndex, setMentionIndex] = useState(0)
  const draftRef = useRef<HTMLTextAreaElement>(null)

  const loadComments = useCallback(async () => {
    const res = await fetch(`/api/checklists/${checklistId}/comments`)
    if (res.ok) setComments((await res.json()).comments)
  }, [checklistId])

  const loadActivity = useCallback(async () => {
    const res = await fetch(`/api/checklists/${checklistId}/activity`)
    if (res.ok) setActivities((await res.json()).activities)
  }, [checklistId])

  useEffect(() => {
    loadComments()
  }, [loadComments])

  useEffect(() => {
    if (tab === 'activity') loadActivity()
  }, [tab, loadActivity])

  // Piggyback on the checklist poll, but leave an unsent draft alone.
  const lastTick = useRef(0)
  useEffect(() => {
    if (refreshTick === lastTick.current) return
    lastTick.current = refreshTick
    if (!draft && !busy) loadComments()
    if (tab === 'activity') loadActivity()
  }, [refreshTick, draft, busy, tab, loadComments, loadActivity])

  const suggestions = mention
    ? users
        .filter((u) => u.name.toLowerCase().startsWith(mention.query.toLowerCase()))
        .slice(0, 5)
    : []
  const activeSuggestion = Math.min(mentionIndex, Math.max(suggestions.length - 1, 0))

  function updateDraft(value: string, caret: number) {
    setDraft(value)
    const before = value.slice(0, caret)
    const at = before.lastIndexOf('@')
    if (at >= 0 && (at === 0 || /\s/.test(before[at - 1]))) {
      const query = before.slice(at + 1)
      if (!query.includes('\n') && query.length <= 40) {
        setMention({ start: at, query })
        setMentionIndex(0)
        return
      }
    }
    setMention(null)
  }

  function pickMention(user: ApiUser) {
    if (!mention) return
    const el = draftRef.current
    const caret = el?.selectionStart ?? draft.length
    const next = `${draft.slice(0, mention.start)}@${user.name} ${draft.slice(caret)}`
    setDraft(next)
    setMention(null)
    const pos = mention.start + user.name.length + 2
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(pos, pos)
    })
  }

  function onDraftKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!mention || suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setMentionIndex((i) => (i + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setMentionIndex((i) => (i - 1 + suggestions.length) % suggestions.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      pickMention(suggestions[activeSuggestion])
    } else if (e.key === 'Escape') {
      setMention(null)
    }
  }

  async function postComment(e: React.FormEvent) {
    e.preventDefault()
    const body = draft.trim()
    if (!body) return
    setBusy(true)
    try {
      const res = await fetch(`/api/checklists/${checklistId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      })
      if (res.ok) {
        setDraft('')
        loadComments()
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-panel">
      <div className="flex gap-1 border-b border-border-soft px-3 pt-2">
        <button
          onClick={() => setTab('comments')}
          className={cn(
            'flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-sm font-medium',
            tab === 'comments' ? 'text-accent' : 'text-muted hover:text-ink'
          )}
        >
          <MessageSquare className="h-4 w-4" />
          Comments{comments.length > 0 && ` (${comments.length})`}
        </button>
        <button
          onClick={() => setTab('activity')}
          className={cn(
            'flex items-center gap-1.5 rounded-t-lg px-3 py-2 text-sm font-medium',
            tab === 'activity' ? 'text-accent' : 'text-muted hover:text-ink'
          )}
        >
          <History className="h-4 w-4" /> Activity
        </button>
      </div>

      {tab === 'comments' ? (
        <div className="space-y-3 px-4 py-4">
          {comments.length === 0 && (
            <p className="text-sm text-faint">No comments yet — start the conversation.</p>
          )}
          {comments.map((c) => (
            <div key={c.id} className="text-sm">
              <p className="text-xs text-faint">
                <span className="font-medium text-muted">{c.author.name}</span> ·{' '}
                {new Date(c.createdAt).toLocaleString()}
              </p>
              <p className="mt-0.5 whitespace-pre-wrap">{renderBodyWithMentions(c.body, users)}</p>
            </div>
          ))}
          <form onSubmit={postComment} className="flex gap-2 pt-1">
            <div className="relative flex-1">
              <textarea
                ref={draftRef}
                value={draft}
                onChange={(e) => updateDraft(e.target.value, e.target.selectionStart)}
                onKeyDown={onDraftKeyDown}
                onBlur={() => setMention(null)}
                placeholder="Write a comment… use @ to mention someone"
                rows={2}
                maxLength={2000}
                className="w-full rounded-lg border border-border bg-field px-3 py-2 text-sm focus:border-accent focus:outline-none"
              />
              {mention && suggestions.length > 0 && (
                <div className="absolute bottom-full left-0 mb-1 w-56 overflow-hidden rounded-lg border border-border bg-panel shadow-lg">
                  {suggestions.map((u, i) => (
                    <button
                      key={u.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        pickMention(u)
                      }}
                      className={cn(
                        'block w-full px-3 py-1.5 text-left text-sm',
                        i === activeSuggestion ? 'bg-accent-soft text-accent' : 'hover:bg-hover'
                      )}
                    >
                      {u.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              className="self-end rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-2 disabled:opacity-50"
            >
              Post
            </button>
          </form>
        </div>
      ) : (
        <div className="px-4 py-4">
          {activities.length === 0 ? (
            <p className="text-sm text-faint">No activity recorded yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {activities.map((a) => (
                <li key={a.id} className="flex flex-wrap items-baseline gap-x-1.5 text-sm">
                  <span className="font-medium">{a.actorName}</span>
                  <span className="text-muted">{ACTION_LABELS[a.action] ?? a.action}</span>
                  {a.detail && <span className="text-muted">“{a.detail}”</span>}
                  <span className="ml-auto text-xs text-faint">
                    {new Date(a.createdAt).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
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
  // True while the user has clicked "Department" but not yet picked one —
  // the change is only saved once at least one department is selected.
  const [pickingDepts, setPickingDepts] = useState(false)
  const sharedIds = new Set(checklist.shares.map((s) => s.user.id))
  const deptIds = new Set((checklist.departments ?? []).map((d) => d.department.id))
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
    if (visibility === 'department' && deptIds.size === 0) {
      setPickingDepts(true)
      return
    }
    setPickingDepts(false)
    setBusy(true)
    try {
      await onSave(
        visibility === 'department'
          ? { visibility, departmentIds: Array.from(deptIds) }
          : { visibility }
      )
    } finally {
      setBusy(false)
    }
  }

  async function toggleDepartment(departmentId: string) {
    const next = new Set(deptIds)
    if (next.has(departmentId)) next.delete(departmentId)
    else next.add(departmentId)
    if (next.size === 0) return // must keep at least one department
    setBusy(true)
    try {
      await onSave({ visibility: 'department', departmentIds: Array.from(next) })
      setPickingDepts(false)
    } finally {
      setBusy(false)
    }
  }

  const isPrivate = checklist.visibility === 'private'
  const isDept = checklist.visibility === 'department'
  const showDeptPicker = isDept || pickingDepts

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
            : isDept
              ? `Departments — ${(checklist.departments ?? []).map((d) => d.department.name).join(', ')}`
              : 'Team — everyone can see it'}
        </span>
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-border-soft px-5 py-4">
          <div className="flex gap-2">
            {[
              { value: 'team', label: 'Team', hint: 'Everyone signed in' },
              { value: 'department', label: 'Department', hint: 'Members of chosen departments' },
              { value: 'private', label: 'Private', hint: 'Only you, assignees & shared users' },
            ].map((v) => {
              const active = v.value === 'department' ? showDeptPicker : checklist.visibility === v.value
              return (
                <button
                  key={v.value}
                  onClick={() => setVisibility(v.value)}
                  disabled={busy || active}
                  className={cn(
                    'flex-1 rounded-lg border p-2.5 text-left text-sm',
                    active ? 'border-accent bg-accent-soft' : 'border-border hover:bg-hover'
                  )}
                >
                  <span className="block font-medium">{v.label}</span>
                  <span className="block text-xs text-faint">{v.hint}</span>
                </button>
              )
            })}
          </div>

          {showDeptPicker && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted">
                Visible to members of these departments
              </p>
              <DepartmentPicker selected={deptIds} onToggle={toggleDepartment} disabled={busy} />
              <p className="mt-2 text-[11px] text-faint">
                Managers and admins can always see every checklist.
              </p>
            </div>
          )}

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

function SupportingDocuments({
  checklistId,
  attachments,
  onChanged,
}: {
  checklistId: string
  attachments: ApiChecklist['attachments']
  onChanged: () => void
}) {
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function upload(file: File) {
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`/api/checklists/${checklistId}/attachments`, {
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

  async function remove(attachmentId: string) {
    await fetch(`/api/attachments/${attachmentId}`, { method: 'DELETE' })
    onChanged()
  }

  return (
    <div className="rounded-2xl border border-border bg-panel p-4">
      <h2 className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
        <Paperclip className="h-4 w-4 text-muted" /> Supporting documents
      </h2>
      {attachments.length === 0 && (
        <p className="text-xs text-faint">Files that relate to the whole list, not a single item.</p>
      )}
      {attachments.map((a) => (
        <div key={a.id} className="flex items-center gap-2 py-1 text-sm">
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
            onClick={() => remove(a.id)}
            className="rounded p-1 text-danger/50 hover:bg-danger-soft hover:text-danger"
            title="Remove"
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
          if (file) upload(file)
        }}
        disabled={uploading}
        className="mt-1 block w-full text-xs text-muted file:mr-2 file:rounded-lg file:border-0 file:bg-hover file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-ink hover:file:bg-border-soft"
      />
      {uploading && <p className="mt-1 text-xs text-faint">Uploading…</p>}
    </div>
  )
}

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

// The editable detail fields for one item. Shown inline under the row on narrow
// screens and in the side panel on wide ones.
function ItemDetails({
  checklistId,
  item,
  users,
  earlier,
  onUpdate,
  onChanged,
  panel,
}: {
  checklistId: string
  item: ItemWithDue
  users: ApiUser[]
  // Items above this one: the only ones a condition can depend on.
  earlier: ApiChecklistItem[]
  // Save a change to this item (queued when offline).
  onUpdate: (data: Record<string, unknown>) => Promise<void>
  onChanged: () => void
  panel?: boolean
}) {
  const [notes, setNotes] = useState(item.notes)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const patchItem = onUpdate

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

  return (
    <div className={cn('space-y-3', !panel && 'border-t border-border-soft px-4 py-3')}>
          <div className={cn("grid gap-3", panel ? "grid-cols-2" : "sm:grid-cols-2 md:grid-cols-4")}>
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
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-muted">Due date</span>
              <input
                type="date"
                value={item.dueDate ? item.dueDate.slice(0, 10) : ''}
                onChange={(e) =>
                  patchItem({
                    dueDate: e.target.value
                      ? new Date(`${e.target.value}T00:00:00`).toISOString()
                      : null,
                  })
                }
                className="w-full rounded-lg border border-border bg-field px-2 py-1.5 text-sm"
              />
            </label>
          <div>
            <span className="mb-1 block text-xs font-medium text-muted">Result</span>
            <div className="flex gap-1.5">
              {(['pass', 'fail', 'na'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => patchItem({ result: item.result === r ? '' : r })}
                  className={cn(
                    'rounded-lg border px-3 py-1 text-xs font-semibold uppercase',
                    item.result === r
                      ? r === 'pass'
                        ? 'border-ok bg-ok-soft text-ok'
                        : r === 'fail'
                          ? 'border-danger bg-danger-soft text-danger'
                          : 'border-muted bg-hover text-ink'
                      : 'border-border text-muted hover:bg-hover'
                  )}
                >
                  {r === 'na' ? 'N/A' : r}
                </button>
              ))}
            </div>
          </div>
          </div>

          {item.result === 'fail' && (
            <CorrectiveAction item={item} users={users} patchItem={patchItem} />
          )}

          <div className={cn('grid gap-3', panel ? 'grid-cols-2' : 'sm:grid-cols-2 md:grid-cols-4')}>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-muted">Only show this item when…</span>
              <span className="flex gap-1.5">
                <select
                  value={item.conditionItemId ?? ''}
                  onChange={(e) =>
                    patchItem(
                      e.target.value
                        ? { conditionItemId: e.target.value, conditionResult: item.conditionResult || 'fail' }
                        : { conditionItemId: null }
                    )
                  }
                  className="min-w-0 flex-1 rounded-lg border border-border bg-field px-2 py-1.5 text-sm"
                >
                  <option value="">Always show</option>
                  {earlier.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.text.length > 40 ? `${e.text.slice(0, 40)}…` : e.text}
                    </option>
                  ))}
                </select>
                {item.conditionItemId && (
                  <select
                    value={item.conditionResult}
                    onChange={(e) => patchItem({ conditionResult: e.target.value })}
                    className="rounded-lg border border-border bg-field px-2 py-1.5 text-sm"
                  >
                    <option value="pass">is Pass</option>
                    <option value="fail">is Fail</option>
                    <option value="na">is N/A</option>
                  </select>
                )}
              </span>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-muted">Due days before list</span>
              <input
                type="number"
                min={0}
                max={365}
                defaultValue={item.dueOffsetDays ?? ''}
                placeholder="—"
                onBlur={(e) => {
                  const v = e.target.value === '' ? null : Math.max(0, Math.min(365, Math.round(Number(e.target.value))))
                  if (v !== (item.dueOffsetDays ?? null)) patchItem({ dueOffsetDays: v })
                }}
                className="w-full rounded-lg border border-border bg-field px-2 py-1.5 text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium text-muted">Answer type</span>
              <select
                value={item.kind}
                onChange={(e) => {
                  if (item.value && !confirm('Changing the answer type clears the current answer. Continue?')) return
                  patchItem({ kind: e.target.value })
                }}
                className="w-full rounded-lg border border-border bg-field px-2 py-1.5 text-sm"
              >
                {ITEM_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {ITEM_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
            {item.kind === 'number' && (
              <>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-medium text-muted">Unit</span>
                  <input
                    key={`unit-${item.unit}`}
                    defaultValue={item.unit}
                    maxLength={20}
                    placeholder="e.g. °C"
                    onBlur={(e) => e.target.value.trim() !== item.unit && patchItem({ unit: e.target.value })}
                    className="w-full rounded-lg border border-border bg-field px-2 py-1.5 text-sm"
                  />
                </label>
                {(['minValue', 'maxValue'] as const).map((field) => (
                  <label key={field} className="block text-sm">
                    <span className="mb-1 block text-xs font-medium text-muted">
                      {field === 'minValue' ? 'Lowest OK reading' : 'Highest OK reading'}
                    </span>
                    <input
                      key={`${field}-${item[field]}`}
                      type="number"
                      step="any"
                      defaultValue={item[field] ?? ''}
                      placeholder="no limit"
                      onBlur={(e) => {
                        const v = e.target.value.trim() === '' ? null : Number(e.target.value)
                        if (v !== null && !Number.isFinite(v)) return
                        if (v !== item[field]) patchItem({ [field]: v })
                      }}
                      className="w-full rounded-lg border border-border bg-field px-2 py-1.5 text-sm"
                    />
                  </label>
                ))}
              </>
            )}
            <label className="flex items-center gap-2 self-end pb-1.5 text-sm">
              <input
                type="checkbox"
                checked={item.photoRequired}
                onChange={(e) => patchItem({ photoRequired: e.target.checked })}
                className="h-4 w-4 accent-accent"
              />
              Photo required to tick
            </label>
          </div>

          <div className={cn("grid gap-3", !panel && "md:grid-cols-2")}>
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
            {/* Phones and tablets: open the camera directly. */}
            <label className="mt-1.5 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-hover lg:hidden">
              <Camera className="h-4 w-4" /> Take photo
              <input
                type="file"
                accept="image/*"
                capture="environment"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) uploadFile(file)
                  e.target.value = ''
                }}
                className="hidden"
              />
            </label>
            {uploading && <p className="mt-1 text-xs text-faint">Uploading…</p>}
          </div>
          </div>
    </div>
  )
}

// yyyy-mm-dd of an instant in the browser's timezone, for <input type="date">.
function localDay(iso: string | null | undefined) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// What will be done about a failed item, by whom and by when. Open actions hold up sign-off.
function CorrectiveAction({
  item,
  users,
  patchItem,
}: {
  item: ItemWithDue
  users: ApiUser[]
  patchItem: (data: Record<string, unknown>) => Promise<void>
}) {
  const [text, setText] = useState(item.actionText)
  const [closing, setClosing] = useState(false)
  const [note, setNote] = useState('')

  if (item.actionClosedAt) {
    return (
      <div className="space-y-1 rounded-lg border border-ok/30 bg-ok-soft p-3 text-sm">
        <p className="font-medium text-ok">Corrective action closed</p>
        {item.actionText && <p>{item.actionText}</p>}
        <p className="text-muted">
          {item.actionClosedByName}, {new Date(item.actionClosedAt).toLocaleDateString()}: {item.actionCloseNote}
        </p>
        <button
          type="button"
          onClick={() => patchItem({ actionClosed: false })}
          className="rounded-lg border border-border px-3 py-1 text-xs font-medium hover:bg-hover"
        >
          Reopen
        </button>
      </div>
    )
  }

  const saveText = () => (text.trim() !== item.actionText ? { actionText: text } : {})

  return (
    <div className="space-y-2 rounded-lg border border-danger/30 bg-danger-soft p-3">
      <p className="text-sm font-medium text-danger">Corrective action (open)</p>
      <label className="block text-sm">
        <span className="mb-1 block text-xs font-medium text-muted">What needs to be done</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => text.trim() !== item.actionText && patchItem({ actionText: text })}
          rows={2}
          placeholder="e.g. Replace the extinguisher and re-tag it"
          className="w-full rounded-lg border border-border bg-field px-2 py-1.5 text-sm"
        />
      </label>
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-muted">Who fixes it</span>
          <select
            value={item.actionAssignedTo?.id ?? ''}
            onChange={(e) => patchItem({ ...saveText(), actionAssignedToId: e.target.value || null })}
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
          <span className="mb-1 block text-xs font-medium text-muted">Fix by</span>
          <input
            type="date"
            value={localDay(item.actionDueDate)}
            onChange={(e) =>
              patchItem({
                ...saveText(),
                actionDueDate: e.target.value ? new Date(`${e.target.value}T00:00:00`).toISOString() : null,
              })
            }
            className="w-full rounded-lg border border-border bg-field px-2 py-1.5 text-sm"
          />
        </label>
      </div>
      {closing ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (!note.trim()) return
            await patchItem({ ...saveText(), actionClosed: true, actionCloseNote: note.trim() })
            setClosing(false)
          }}
          className="space-y-2"
        >
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            autoFocus
            placeholder="What was done? (required)"
            className="w-full rounded-lg border border-border bg-field px-2 py-1.5 text-sm"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!note.trim()}
              className="rounded-lg bg-ok px-3 py-1.5 text-xs font-semibold text-accent-ink disabled:opacity-40"
            >
              Close action
            </button>
            <button
              type="button"
              onClick={() => setClosing(false)}
              className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-hover"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setClosing(true)}
          className="rounded-lg border border-ok/40 px-3 py-1.5 text-xs font-semibold text-ok hover:bg-ok-soft"
        >
          Mark as fixed…
        </button>
      )}
    </div>
  )
}

function ItemRow({
  checklistId,
  item,
  users,
  earlier,
  wide,
  selected,
  onSelect,
  onUpdate,
  onChanged,
  dragging,
  onDragStart,
  onDragOver,
  onDragEnd,
}: {
  checklistId: string
  item: ItemWithDue
  users: ApiUser[]
  earlier: ApiChecklistItem[]
  // On wide screens details open in the side panel; otherwise inline under the row.
  wide: boolean
  selected: boolean
  onSelect: () => void
  // Tick, untick or answer the item.
  onUpdate: (data: Record<string, unknown>) => Promise<void>
  onChanged: () => void
  dragging: boolean
  onDragStart: () => void
  onDragOver: (e: React.DragEvent) => void
  onDragEnd: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  // Picked from the corrective-action banner: open the details inline.
  useEffect(() => {
    if (selected && !wide) setExpanded(true)
  }, [selected, wide])
  // Only arm dragging from the grip so text selection and inputs keep working.
  const [armed, setArmed] = useState(false)
  const [signing, setSigning] = useState(false)
  const answerRef = useRef<HTMLInputElement>(null)
  const photos = item.attachments.filter((a) => a.mimeType.startsWith('image/')).length

  // An unanswered typed item is ticked by answering it, so the box leads there.
  function toggle() {
    if (!item.checked && item.kind === 'signature' && !item.value) setSigning(true)
    else if (!item.checked && item.kind !== 'check' && !item.value) answerRef.current?.focus()
    else onUpdate({ checked: !item.checked })
  }

  async function addSubtask() {
    const text = prompt(`New subtask under "${item.text}":`)?.trim()
    if (!text) return
    const res = await fetch(`/api/checklists/${checklistId}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, parentItemId: item.id }),
    })
    if (!res.ok) alert('Could not add the subtask')
    onChanged()
  }

  async function removeItem() {
    if (!confirm(`Delete item "${item.text}"?`)) return
    await fetch(`/api/checklists/${checklistId}/items/${item.id}`, { method: 'DELETE' })
    onChanged()
  }

  const hasExtras = item.notes || item.result || item.attachments.length > 0 || item.assignedTo

  return (
    <div
      id={`item-${item.id}`}
      draggable={armed}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={() => {
        setArmed(false)
        onDragEnd()
      }}
      className={cn(
        'rounded-lg border bg-panel',
        wide && selected ? 'border-accent ring-1 ring-accent' : 'border-border',
        dragging && 'opacity-50'
      )}
    >
      <div className="flex items-center gap-3 px-3 py-3 md:py-1">
        <div
          className={cn('min-w-0 flex-1', wide && 'cursor-pointer')}
          onClick={wide ? onSelect : undefined}
        >
          <p className={cn('text-sm', item.checked && 'text-faint line-through')}>
            {item.text}
          </p>
          {(item.kind === 'number' || item.kind === 'text') && (
            <AnswerField item={item} inputRef={answerRef} onSave={(value) => onUpdate({ value })} />
          )}
          {item.kind === 'signature' &&
            (item.value ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.value}
                alt={`Signature for ${item.text}`}
                title="Untick the item to sign again"
                className="mt-1 h-12 rounded border border-border bg-white"
              />
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setSigning(true)
                }}
                className="mt-1 flex items-center gap-1.5 rounded-lg border border-border px-3 py-1 text-xs font-medium hover:bg-hover"
              >
                <PenLine className="h-3.5 w-3.5" /> Sign
              </button>
            ))}
          {item.checked && item.checkedByName && (
            <p className="text-[11px] text-faint">
              {item.checkedByName}
              {item.checkedAt && ` · ${new Date(item.checkedAt).toLocaleString()}`}
            </p>
          )}
        </div>

        {item.result && (
          <span
            className={cn(
              'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase',
              item.result === 'pass' && 'bg-ok-soft text-ok',
              item.result === 'fail' && 'bg-danger-soft text-danger',
              item.result === 'na' && 'bg-hover text-muted'
            )}
          >
            {item.result === 'na' ? 'N/A' : item.result}
          </span>
        )}
        {item.result === 'fail' && (
          <span
            className={cn(
              'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold',
              item.actionClosedAt ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn'
            )}
            title={item.actionText || undefined}
          >
            {item.actionClosedAt ? 'Fixed' : 'Action open'}
          </span>
        )}

        {item.photoRequired && (
          <span
            className={cn(
              'flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
              photos > 0 ? 'bg-hover text-muted' : 'bg-warn-soft text-warn'
            )}
            title={photos > 0 ? 'Photo added' : 'A photo is needed before this can be ticked'}
          >
            <Camera className="h-3 w-3" />
            {photos > 0 ? photos : 'Photo'}
          </span>
        )}

        {item.dueDate && (
          <span
            className={cn(
              'flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
              !item.checked && new Date(item.dueDate) < new Date()
                ? 'bg-danger-soft text-danger'
                : 'bg-hover text-muted'
            )}
          >
            <Calendar className="h-3 w-3" />
            {new Date(item.dueDate).toLocaleDateString()}
          </span>
        )}

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
          onClick={wide ? onSelect : () => setExpanded((v) => !v)}
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
        {item.indent === 0 && (
          <button
            onClick={addSubtask}
            className="rounded p-1.5 text-faint hover:bg-hover"
            title="Add subtask"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
        <button
          onClick={removeItem}
          className="rounded p-1.5 text-danger/50 hover:bg-danger-soft hover:text-danger"
        >
          <Trash2 className="h-4 w-4" />
        </button>
        <input
          type="checkbox"
          checked={item.checked}
          onChange={toggle}
          title={item.checked && item.value ? 'Untick to clear the answer' : undefined}
          className="ml-1 h-5 w-5 shrink-0 accent-accent"
        />
        <span
          onMouseDown={() => setArmed(true)}
          onMouseUp={() => setArmed(false)}
          onTouchStart={() => setArmed(true)}
          onTouchEnd={() => setArmed(false)}
          className="-mr-1 shrink-0 cursor-grab touch-none text-faint hover:text-muted active:cursor-grabbing"
          title="Drag to reorder"
        >
          <GripVertical className="h-4 w-4" />
        </span>
      </div>

      {!wide && expanded && (
        <ItemDetails
          checklistId={checklistId}
          item={item}
          users={users}
          earlier={earlier}
          onUpdate={onUpdate}
          onChanged={onChanged}
        />
      )}
      {signing && (
        <SignaturePad
          title={item.text}
          onCancel={() => setSigning(false)}
          onSave={async (value) => {
            setSigning(false)
            await onUpdate({ value })
          }}
        />
      )}
    </div>
  )
}

// Inline reading or text answer on an item row; saves on Enter or when leaving the field.
function AnswerField({
  item,
  inputRef,
  onSave,
}: {
  item: ApiChecklistItem
  inputRef: React.RefObject<HTMLInputElement | null>
  onSave: (value: string) => void
}) {
  const [draft, setDraft] = useState(item.value)
  useEffect(() => setDraft(item.value), [item.value])
  const number = item.kind === 'number'
  const invalid = number && draft.trim() !== '' && parseNumber(draft) === null
  const range = number ? rangeLabel(item.minValue, item.maxValue, item.unit) : ''

  function commit() {
    const v = draft.trim()
    if (!invalid && v !== item.value) onSave(v)
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            e.currentTarget.blur()
          }
        }}
        inputMode={number ? 'decimal' : 'text'}
        maxLength={number ? 30 : 2000}
        placeholder={number ? 'Reading' : 'Answer'}
        aria-label={`${number ? 'Reading' : 'Answer'} for ${item.text}`}
        className={cn(
          'rounded-lg border bg-field px-2 py-1 text-sm',
          number ? 'w-28' : 'w-full max-w-sm',
          invalid ? 'border-danger' : 'border-border'
        )}
      />
      {number && item.unit && <span className="text-xs text-muted">{item.unit}</span>}
      {range && <span className="text-xs text-faint">OK: {range}</span>}
      {invalid && <span className="text-xs text-danger">Enter a number</span>}
    </div>
  )
}

// Draw a signature with mouse, finger or pen; saved as a small PNG data URL.
function SignaturePad({
  title,
  onCancel,
  onSave,
}: {
  title: string
  onCancel: () => void
  onSave: (dataUrl: string) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [drawn, setDrawn] = useState(false)

  const clear = useCallback(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    // White background so the signature reads in dark mode and on paper.
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
    setDrawn(false)
  }, [])
  useEffect(clear, [clear])

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * e.currentTarget.width,
      y: ((e.clientY - rect.top) / rect.height) * e.currentTarget.height,
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onCancel}>
      <div
        className="w-full max-w-md space-y-3 rounded-xl border border-border bg-panel p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="font-semibold">Sign</h2>
          <p className="truncate text-sm text-muted">{title}</p>
        </div>
        <canvas
          ref={canvasRef}
          width={400}
          height={160}
          className="w-full touch-none rounded-lg border border-border bg-white"
          onPointerDown={(e) => {
            const ctx = e.currentTarget.getContext('2d')
            if (!ctx) return
            e.currentTarget.setPointerCapture(e.pointerId)
            drawing.current = true
            const { x, y } = point(e)
            ctx.beginPath()
            ctx.moveTo(x, y)
          }}
          onPointerMove={(e) => {
            const ctx = e.currentTarget.getContext('2d')
            if (!drawing.current || !ctx) return
            const { x, y } = point(e)
            ctx.lineWidth = 2.5
            ctx.lineCap = 'round'
            ctx.lineJoin = 'round'
            ctx.strokeStyle = '#111'
            ctx.lineTo(x, y)
            ctx.stroke()
            setDrawn(true)
          }}
          onPointerUp={() => (drawing.current = false)}
          onPointerCancel={() => (drawing.current = false)}
        />
        <div className="flex justify-between gap-2">
          <button
            type="button"
            onClick={clear}
            className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-hover"
          >
            Clear
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-hover"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!drawn}
              onClick={() => canvasRef.current && onSave(canvasRef.current.toDataURL('image/png'))}
              className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-ink hover:bg-accent-2 disabled:opacity-40"
            >
              Save signature
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
