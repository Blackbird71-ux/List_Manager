'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Calendar,
  CheckCircle2,
  ClipboardList,
  Plus,
  RefreshCw,
  Search,
  User as UserIcon,
} from 'lucide-react'
import type { ApiChecklist, ApiTemplate, ApiUser } from '@/lib/types'
import { cn } from '@/lib/utils'

const PRIORITY_STYLES: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-slate-100 text-slate-600',
}

export function DashboardClient({ currentUserId }: { currentUserId: string }) {
  const [checklists, setChecklists] = useState<ApiChecklist[]>([])
  const [templates, setTemplates] = useState<ApiTemplate[]>([])
  const [users, setUsers] = useState<ApiUser[]>([])
  const [loading, setLoading] = useState(true)

  const [statusFilter, setStatusFilter] = useState<'active' | 'completed' | 'all'>('active')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [assigneeFilter, setAssigneeFilter] = useState('')
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)

  const load = useCallback(async () => {
    try {
      const [clRes, tRes, uRes] = await Promise.all([
        fetch('/api/checklists'),
        fetch('/api/templates'),
        fetch('/api/users'),
      ])
      if (clRes.ok) setChecklists((await clRes.json()).checklists)
      if (tRes.ok) setTemplates((await tRes.json()).templates)
      if (uRes.ok) setUsers((await uRes.json()).users)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const categories = useMemo(
    () => Array.from(new Set(checklists.map((c) => c.category))).sort(),
    [checklists]
  )

  const filtered = useMemo(() => {
    return checklists.filter((c) => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false
      if (categoryFilter && c.category !== categoryFilter) return false
      if (assigneeFilter === 'me' && c.assignedTo?.id !== currentUserId) return false
      if (assigneeFilter && assigneeFilter !== 'me' && c.assignedTo?.id !== assigneeFilter)
        return false
      if (search && !c.title.toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [checklists, statusFilter, categoryFilter, assigneeFilter, search, currentUserId])

  const stats = useMemo(() => {
    const active = checklists.filter((c) => c.status === 'active')
    const mine = active.filter((c) => c.assignedTo?.id === currentUserId)
    const overdue = active.filter((c) => c.dueDate && new Date(c.dueDate) < new Date())
    return {
      active: active.length,
      mine: mine.length,
      overdue: overdue.length,
      completed: checklists.filter((c) => c.status === 'completed').length,
    }
  }, [checklists, currentUserId])

  if (loading) {
    return <p className="py-12 text-center text-sm text-slate-400">Loading…</p>
  }

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Active', value: stats.active, color: 'text-blue-600' },
          { label: 'Assigned to me', value: stats.mine, color: 'text-indigo-600' },
          { label: 'Overdue', value: stats.overdue, color: 'text-red-600' },
          { label: 'Completed', value: stats.completed, color: 'text-emerald-600' },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className={cn('text-2xl font-bold', s.color)}>{s.value}</p>
            <p className="text-xs text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search checklists…"
            className="rounded-lg border border-slate-300 bg-white py-2 pl-8 pr-3 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
          className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm"
        >
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="all">All</option>
        </select>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <select
          value={assigneeFilter}
          onChange={(e) => setAssigneeFilter(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm"
        >
          <option value="">Anyone</option>
          <option value="me">Assigned to me</option>
          {users
            .filter((u) => u.id !== currentUserId)
            .map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
        </select>

        <button
          onClick={() => setShowCreate(true)}
          className="ml-auto flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" /> New checklist
        </button>
      </div>

      {/* Checklist cards */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 py-16 text-center">
          <ClipboardList className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 text-sm text-slate-400">No checklists match.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => {
            const done = c.items.filter((i) => i.checked).length
            const total = c.items.length
            const pct = total > 0 ? Math.round((done / total) * 100) : 0
            const overdue =
              c.status === 'active' && c.dueDate && new Date(c.dueDate) < new Date()
            return (
              <Link
                key={c.id}
                href={`/checklists/${c.id}`}
                className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-blue-300 hover:shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-slate-900">{c.title}</h3>
                  {c.status === 'completed' ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
                  ) : (
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                        PRIORITY_STYLES[c.priority] ?? PRIORITY_STYLES.low
                      )}
                    >
                      {c.priority}
                    </span>
                  )}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5">{c.category}</span>
                  {c.recurrence !== 'none' && (
                    <span className="flex items-center gap-1 text-blue-600">
                      <RefreshCw className="h-3 w-3" /> {c.recurrence}
                    </span>
                  )}
                  {c.dueDate && (
                    <span
                      className={cn('flex items-center gap-1', overdue && 'font-semibold text-red-600')}
                    >
                      <Calendar className="h-3 w-3" />
                      {new Date(c.dueDate).toLocaleDateString()}
                    </span>
                  )}
                  {c.assignedTo && (
                    <span className="flex items-center gap-1">
                      <UserIcon className="h-3 w-3" /> {c.assignedTo.name}
                    </span>
                  )}
                </div>

                {total > 0 && (
                  <div className="mt-3">
                    <div className="mb-1 flex justify-between text-[11px] text-slate-400">
                      <span>
                        {done}/{total} done
                      </span>
                      <span>{pct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100">
                      <div
                        className={cn(
                          'h-1.5 rounded-full',
                          pct === 100 ? 'bg-emerald-500' : 'bg-blue-500'
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )}
              </Link>
            )
          })}
        </div>
      )}

      {showCreate && (
        <CreateChecklistModal
          templates={templates.filter((t) => !t.archived)}
          users={users}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false)
            load()
          }}
        />
      )}
    </div>
  )
}

function CreateChecklistModal({
  templates,
  users,
  onClose,
  onCreated,
}: {
  templates: ApiTemplate[]
  users: ApiUser[]
  onClose: () => void
  onCreated: () => void
}) {
  const [mode, setMode] = useState<'template' | 'adhoc'>(templates.length > 0 ? 'template' : 'adhoc')
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '')
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [assignedToId, setAssignedToId] = useState('')
  const [priority, setPriority] = useState('medium')
  const [itemsText, setItemsText] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const common = {
        dueDate: dueDate ? new Date(`${dueDate}T00:00:00`).toISOString() : null,
        assignedToId: assignedToId || null,
        priority,
      }
      const body =
        mode === 'template'
          ? { templateId, title: title.trim() || undefined, ...common }
          : {
              title: title.trim(),
              items: itemsText
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean)
                .map((text) => ({ text })),
              ...common,
            }
      const res = await fetch('/api/checklists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Could not create the checklist')
        return
      }
      onCreated()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5 shadow-xl"
      >
        <h2 className="text-lg font-semibold">New checklist</h2>

        <div className="flex gap-2">
          {(['template', 'adhoc'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm font-medium',
                mode === m ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
              )}
            >
              {m === 'template' ? 'From template' : 'Blank'}
            </button>
          ))}
        </div>

        {mode === 'template' ? (
          <>
            <div>
              <label className="mb-1 block text-sm font-medium">Template</label>
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title} ({t.items.length} items
                    {t.recurrence !== 'none' ? `, ${t.recurrence}` : ''})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                Title <span className="font-normal text-slate-400">(optional override)</span>
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="mb-1 block text-sm font-medium">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Items (one per line)</label>
              <textarea
                value={itemsText}
                onChange={(e) => setItemsText(e.target.value)}
                rows={4}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Due date</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Assign to</label>
          <select
            value={assignedToId}
            onChange={(e) => setAssignedToId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || (mode === 'template' && !templateId)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  )
}
