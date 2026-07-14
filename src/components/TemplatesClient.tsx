'use client'

import { useCallback, useEffect, useState } from 'react'
import { Archive, ArchiveRestore, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import type { ApiTemplate } from '@/lib/types'
import { cn } from '@/lib/utils'

const RECURRENCES = ['none', 'daily', 'weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly']

interface DraftItem {
  text: string
  priority: string
}

interface DraftField {
  name: string
  type: string
  options: string // comma-separated in the editor
  required: boolean
}

export function TemplatesClient() {
  const [templates, setTemplates] = useState<ApiTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [showArchived, setShowArchived] = useState(false)
  const [editing, setEditing] = useState<ApiTemplate | 'new' | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/templates?archived=true')
    if (res.ok) setTemplates((await res.json()).templates)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function toggleArchive(t: ApiTemplate) {
    await fetch(`/api/templates/${t.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: !t.archived }),
    })
    load()
  }

  async function remove(t: ApiTemplate) {
    if (!confirm(`Delete template "${t.title}"? Existing checklists keep working.`)) return
    await fetch(`/api/templates/${t.id}`, { method: 'DELETE' })
    load()
  }

  const visible = templates.filter((t) => (showArchived ? true : !t.archived))

  if (loading) {
    return <p className="py-12 text-center text-sm text-slate-400">Loading…</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold">Templates</h1>
        <label className="ml-2 flex items-center gap-1.5 text-sm text-slate-500">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Show archived
        </label>
        <button
          onClick={() => setEditing('new')}
          className="ml-auto flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" /> New template
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 py-16 text-center text-sm text-slate-400">
          No templates yet. Create one to get started.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((t) => (
            <div
              key={t.id}
              className={cn(
                'rounded-xl border border-slate-200 bg-white p-4',
                t.archived && 'opacity-60'
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold">{t.title}</h3>
                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={() => setEditing(t)}
                    className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
                    title="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => toggleArchive(t)}
                    className="rounded p-1.5 text-slate-500 hover:bg-slate-100"
                    title={t.archived ? 'Restore' : 'Archive'}
                  >
                    {t.archived ? (
                      <ArchiveRestore className="h-4 w-4" />
                    ) : (
                      <Archive className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    onClick={() => remove(t)}
                    className="rounded p-1.5 text-red-400 hover:bg-red-50"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {t.description && <p className="mt-1 text-sm text-slate-500">{t.description}</p>}

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                <span className="rounded bg-slate-100 px-1.5 py-0.5">{t.category}</span>
                {t.recurrence !== 'none' && (
                  <span className="flex items-center gap-1 text-blue-600">
                    <RefreshCw className="h-3 w-3" /> {t.recurrence}
                  </span>
                )}
                <span>{t.items.length} items</span>
                {t.customFields.length > 0 && <span>{t.customFields.length} fields</span>}
                <span>used {t._count.checklists}×</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <TemplateEditor
          template={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function TemplateEditor({
  template,
  onClose,
  onSaved,
}: {
  template: ApiTemplate | null
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState(template?.title ?? '')
  const [description, setDescription] = useState(template?.description ?? '')
  const [category, setCategory] = useState(template?.category ?? 'general')
  const [recurrence, setRecurrence] = useState(template?.recurrence ?? 'none')
  const [items, setItems] = useState<DraftItem[]>(
    template?.items.map((i) => ({ text: i.text, priority: i.priority ?? '' })) ?? [
      { text: '', priority: '' },
    ]
  )
  const [fields, setFields] = useState<DraftField[]>(
    template?.customFields.map((f) => ({
      name: f.name,
      type: f.type,
      options: (JSON.parse(f.options) as string[]).join(', '),
      required: f.required,
    })) ?? []
  )
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const body = {
        title: title.trim(),
        description: description.trim(),
        category: category.trim() || 'general',
        recurrence,
        items: items
          .filter((i) => i.text.trim())
          .map((i) => ({ text: i.text.trim(), priority: i.priority || null })),
        customFields: fields
          .filter((f) => f.name.trim())
          .map((f) => ({
            name: f.name.trim(),
            type: f.type,
            options:
              f.type === 'dropdown'
                ? f.options.split(',').map((o) => o.trim()).filter(Boolean)
                : [],
            required: f.required,
          })),
      }
      const res = await fetch(template ? `/api/templates/${template.id}` : '/api/templates', {
        method: template ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Could not save the template')
        return
      }
      onSaved()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-4">
      <form
        onSubmit={submit}
        className="my-8 w-full max-w-2xl space-y-4 rounded-2xl bg-white p-5 shadow-xl"
      >
        <h2 className="text-lg font-semibold">{template ? 'Edit template' : 'New template'}</h2>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Category</label>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Repeats</label>
            <select
              value={recurrence}
              onChange={(e) => setRecurrence(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {RECURRENCES.map((r) => (
                <option key={r} value={r}>
                  {r === 'none' ? 'Does not repeat' : r}
                </option>
              ))}
            </select>
            {recurrence !== 'none' && (
              <p className="mt-1 text-xs text-slate-400">
                Completing a checklist made from this template automatically creates the next one.
              </p>
            )}
          </div>
        </div>

        {/* Items */}
        <div>
          <label className="mb-1 block text-sm font-medium">Checklist items</label>
          <div className="space-y-2">
            {items.map((item, idx) => (
              <div key={idx} className="flex gap-2">
                <input
                  value={item.text}
                  onChange={(e) =>
                    setItems(items.map((it, i) => (i === idx ? { ...it, text: e.target.value } : it)))
                  }
                  placeholder={`Item ${idx + 1}`}
                  className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <select
                  value={item.priority}
                  onChange={(e) =>
                    setItems(
                      items.map((it, i) => (i === idx ? { ...it, priority: e.target.value } : it))
                    )
                  }
                  className="w-28 rounded-lg border border-slate-300 px-2 py-2 text-sm"
                >
                  <option value="">No priority</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
                <button
                  type="button"
                  onClick={() => setItems(items.filter((_, i) => i !== idx))}
                  className="rounded p-2 text-red-400 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setItems([...items, { text: '', priority: '' }])}
            className="mt-2 flex items-center gap-1 text-sm text-blue-600 hover:underline"
          >
            <Plus className="h-4 w-4" /> Add item
          </button>
        </div>

        {/* Custom fields */}
        <div>
          <label className="mb-1 block text-sm font-medium">
            Custom fields{' '}
            <span className="font-normal text-slate-400">
              (filled in on each checklist, e.g. Site, Inspector)
            </span>
          </label>
          <div className="space-y-2">
            {fields.map((f, idx) => (
              <div key={idx} className="flex flex-wrap gap-2">
                <input
                  value={f.name}
                  onChange={(e) =>
                    setFields(fields.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)))
                  }
                  placeholder="Field name"
                  className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <select
                  value={f.type}
                  onChange={(e) =>
                    setFields(fields.map((x, i) => (i === idx ? { ...x, type: e.target.value } : x)))
                  }
                  className="rounded-lg border border-slate-300 px-2 py-2 text-sm"
                >
                  <option value="text">Text</option>
                  <option value="dropdown">Dropdown</option>
                  <option value="user">User</option>
                </select>
                {f.type === 'dropdown' && (
                  <input
                    value={f.options}
                    onChange={(e) =>
                      setFields(
                        fields.map((x, i) => (i === idx ? { ...x, options: e.target.value } : x))
                      )
                    }
                    placeholder="Options, comma separated"
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                )}
                <button
                  type="button"
                  onClick={() => setFields(fields.filter((_, i) => i !== idx))}
                  className="rounded p-2 text-red-400 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setFields([...fields, { name: '', type: 'text', options: '', required: true }])}
            className="mt-2 flex items-center gap-1 text-sm text-blue-600 hover:underline"
          >
            <Plus className="h-4 w-4" /> Add field
          </button>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save template'}
          </button>
        </div>
      </form>
    </div>
  )
}
