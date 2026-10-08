'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Archive,
  ArchiveRestore,
  Download,
  History,
  Indent,
  Outdent,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react'
import type { ApiTemplate, ApiUser } from '@/lib/types'
import { DepartmentPicker } from '@/components/DepartmentPicker'
import { cn } from '@/lib/utils'

const RECURRENCES = ['none', 'daily', 'weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly']

// A row in the editor: a checklist item, or a section heading that applies to
// the items below it (until the next heading).
interface DraftItem {
  text: string
  priority: string
  heading?: boolean
  indent?: number // 1 = subtask of the item above
  // Conditional display and relative due date (items only, not headings).
  uid?: string
  condUid?: string // row this item depends on (must be above it)
  condResult?: string
  offset?: string // due this many days before the checklist's due date
}

let uidCounter = 0
const newUid = () => `r${Date.now().toString(36)}${uidCounter++}`

// A template pre-filled from an imported file; saved as a new template.
interface ImportedDraft {
  title: string
  items: { text: string; section: string; indent: number }[]
  fields: string[]
}

function itemsToRows(
  items: {
    text: string
    priority: string | null
    section: string
    indent: number
    conditionIndex?: number | null
    conditionResult?: string
    dueOffsetDays?: number | null
  }[]
): DraftItem[] {
  const rows: DraftItem[] = []
  const uids = items.map(() => newUid())
  let current = ''
  items.forEach((i, n) => {
    if (i.section !== current) {
      current = i.section
      if (current) rows.push({ text: current, priority: '', heading: true })
    }
    rows.push({
      text: i.text,
      priority: i.priority ?? '',
      indent: i.indent,
      uid: uids[n],
      condUid: i.conditionIndex != null ? uids[i.conditionIndex] : undefined,
      condResult: i.conditionResult || undefined,
      offset: i.dueOffsetDays != null ? String(i.dueOffsetDays) : '',
    })
  })
  return rows
}

interface DraftField {
  name: string
  type: string
  options: string // comma-separated in the editor
  required: boolean
}

export function TemplatesClient({ userId, role }: { userId: string; role: string }) {
  const canEdit = (t: ApiTemplate) =>
    role === 'admin' || role === 'manager' || t.createdBy.id === userId
  const [templates, setTemplates] = useState<ApiTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [showArchived, setShowArchived] = useState(false)
  const [editing, setEditing] = useState<ApiTemplate | 'new' | null>(null)
  const [starting, setStarting] = useState<ApiTemplate | null>(null)
  const [historyFor, setHistoryFor] = useState<ApiTemplate | null>(null)
  const [importError, setImportError] = useState('')
  const [importing, setImporting] = useState(false)
  const [imported, setImported] = useState<ImportedDraft | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  async function exportTemplates() {
    setImportError('')
    const res = await fetch('/api/templates/export')
    if (!res.ok) {
      setImportError('Could not export templates')
      return
    }
    const url = URL.createObjectURL(await res.blob())
    const a = document.createElement('a')
    a.href = url
    a.download = 'templates-export.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function importTemplates(file: File) {
    setImportError('')
    setImporting(true)
    try {
      if (!file.name.toLowerCase().endsWith('.json')) {
        const form = new FormData()
        form.append('file', file)
        const res = await fetch('/api/templates/import/parse', { method: 'POST', body: form })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setImportError(data.error ?? 'Could not read that file')
          return
        }
        setImported(data)
        return
      }
      let body: unknown
      try {
        body = JSON.parse(await file.text())
      } catch {
        setImportError('That file is not valid JSON')
        return
      }
      const res = await fetch('/api/templates/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setImportError(data.error ?? 'Could not import templates')
        return
      }
      load()
    } finally {
      setImporting(false)
    }
  }

  const visible = templates.filter((t) => (showArchived ? true : !t.archived))

  if (loading) {
    return <p className="py-12 text-center text-sm text-faint">Loading…</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold">Templates</h1>
        <label className="ml-2 flex items-center gap-1.5 text-sm text-muted">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Show archived
        </label>
        <button
          onClick={exportTemplates}
          className="ml-auto flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-hover"
        >
          <Download className="h-4 w-4" /> Export
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={importing}
          className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-hover disabled:opacity-50"
        >
          <Upload className="h-4 w-4" /> {importing ? 'Importing…' : 'Import'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.txt,.md,.csv,.xlsx,.docx"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) importTemplates(file)
          }}
        />
        <button
          onClick={() => setEditing('new')}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-2"
        >
          <Plus className="h-4 w-4" /> New template
        </button>
      </div>

      {importError && <p className="text-sm text-danger">{importError}</p>}

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-faint">
          No templates yet. Create one to get started.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((t) => (
            <div
              key={t.id}
              className={cn(
                'rounded-xl border border-border bg-panel p-4',
                t.archived && 'opacity-60'
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold">{t.title}</h3>
                <div className="flex shrink-0 gap-1">
                  {canEdit(t) && (
                    <button
                      onClick={() => setEditing(t)}
                      className="rounded p-1.5 text-muted hover:bg-hover"
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    onClick={() => setHistoryFor(t)}
                    className="rounded p-1.5 text-muted hover:bg-hover"
                    title="Version history"
                  >
                    <History className="h-4 w-4" />
                  </button>
                  {canEdit(t) && (
                    <button
                      onClick={() => toggleArchive(t)}
                      className="rounded p-1.5 text-muted hover:bg-hover"
                      title={t.archived ? 'Restore' : 'Archive'}
                    >
                      {t.archived ? (
                        <ArchiveRestore className="h-4 w-4" />
                      ) : (
                        <Archive className="h-4 w-4" />
                      )}
                    </button>
                  )}
                  {canEdit(t) && (
                    <button
                      onClick={() => remove(t)}
                      className="rounded p-1.5 text-danger/50 hover:bg-danger-soft hover:text-danger"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {t.description && <p className="mt-1 text-sm text-muted">{t.description}</p>}

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                <span className="rounded bg-hover px-1.5 py-0.5">{t.category}</span>
                {t.recurrence !== 'none' && (
                  <span className="flex items-center gap-1 text-accent">
                    <RefreshCw className="h-3 w-3" /> {t.recurrence}
                  </span>
                )}
                <span>{t.items.length} items</span>
                {t.customFields.length > 0 && <span>{t.customFields.length} fields</span>}
                <span>used {t._count.checklists}×</span>
              </div>

              {!t.archived && (
                <button
                  onClick={() => setStarting(t)}
                  className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-2"
                >
                  <Play className="h-4 w-4" /> Start checklist
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {(editing || imported) && (
        <TemplateEditor
          template={editing && editing !== 'new' ? editing : null}
          imported={imported}
          onClose={() => {
            setEditing(null)
            setImported(null)
          }}
          onSaved={() => {
            setEditing(null)
            setImported(null)
            load()
          }}
        />
      )}

      {starting && <StartChecklistModal template={starting} onClose={() => setStarting(null)} />}

      {historyFor && (
        <TemplateHistoryModal
          template={historyFor}
          onClose={() => setHistoryFor(null)}
          onRestored={() => {
            setHistoryFor(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function StartChecklistModal({
  template,
  onClose,
}: {
  template: ApiTemplate
  onClose: () => void
}) {
  const router = useRouter()
  const [users, setUsers] = useState<ApiUser[]>([])
  const [dueDate, setDueDate] = useState('')
  const [assignedToId, setAssignedToId] = useState('')
  const [visibility, setVisibility] = useState('team')
  const [departmentIds, setDepartmentIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/users').then(async (res) => {
      if (res.ok) setUsers((await res.json()).users)
    })
  }, [])

  function toggleDepartment(id: string) {
    setDepartmentIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const res = await fetch('/api/checklists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: template.id,
          dueDate: dueDate ? new Date(`${dueDate}T00:00:00`).toISOString() : null,
          assignedToId: assignedToId || null,
          visibility,
          departmentIds: visibility === 'department' ? Array.from(departmentIds) : [],
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Could not create the checklist')
        return
      }
      const data = await res.json()
      router.push(`/checklists/${data.checklist.id}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-3 rounded-2xl border border-border bg-panel p-5 shadow-xl">
        <h2 className="text-lg font-semibold">Start “{template.title}”</h2>
        {template.recurrence !== 'none' && (
          <p className="flex items-center gap-1 text-xs text-accent">
            <RefreshCw className="h-3 w-3" /> Repeats {template.recurrence} — completing it creates
            the next one automatically.
          </p>
        )}
        <div>
          <label className="mb-1 block text-sm font-medium">Due date (optional)</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full rounded-lg border border-border bg-field px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Assign to (optional)</label>
          <select
            value={assignedToId}
            onChange={(e) => setAssignedToId(e.target.value)}
            className="w-full rounded-lg border border-border bg-field px-3 py-2 text-sm"
          >
            <option value="">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Visibility</label>
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value)}
            className="w-full rounded-lg border border-border bg-field px-3 py-2 text-sm"
          >
            <option value="team">Team — everyone</option>
            <option value="department">Department — chosen departments</option>
            <option value="private">Private — only me + shared</option>
          </select>
        </div>

        {visibility === 'department' && (
          <div>
            <label className="mb-1 block text-sm font-medium">Visible to departments</label>
            <DepartmentPicker selected={departmentIds} onToggle={toggleDepartment} disabled={busy} />
          </div>
        )}

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-hover"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-2 disabled:opacity-50"
          >
            <Play className="h-4 w-4" /> {busy ? 'Starting…' : 'Start checklist'}
          </button>
        </div>
      </form>
    </div>
  )
}

interface VersionRow {
  version: number;
  savedByName: string;
  createdAt: string;
  snapshot: {
    items: { text: string; section: string; indent: number }[];
    customFields: { name: string }[];
  };
}

// Earlier saved versions of a template. Restoring one saves it as a new version,
// so nothing is lost and lists already running are untouched.
function TemplateHistoryModal({
  template,
  onClose,
  onRestored,
}: {
  template: ApiTemplate;
  onClose: () => void;
  onRestored: () => void;
}) {
  const [versions, setVersions] = useState<VersionRow[] | null>(null);
  const [current, setCurrent] = useState(template.version);
  const [open, setOpen] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/templates/${template.id}/versions`)
      .then((res) => res.json())
      .then((data) => {
        setVersions(data.versions ?? []);
        setCurrent(data.current ?? template.version);
      })
      .catch(() => setVersions([]));
  }, [template.id, template.version]);

  async function restore(v: VersionRow) {
    if (
      !confirm(
        `Restore version ${v.version}? It will be saved as a new version.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    const res = await fetch(`/api/templates/${template.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(v.snapshot),
    });
    setBusy(false);
    if (res.ok) onRestored();
    else setError("Could not restore this version.");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-panel p-5">
        <h2 className="font-semibold">Version history — {template.title}</h2>
        <p className="mt-0.5 text-sm text-muted">
          Versions are saved when a template&apos;s items or fields are edited.
          Lists already created keep the items they started with.
        </p>
        {versions === null ? (
          <p className="mt-4 text-sm text-faint">Loading…</p>
        ) : versions.length === 0 ? (
          <p className="mt-4 text-sm text-faint">
            No earlier versions yet — history starts with the next edit.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {versions.map((v) => (
              <li
                key={v.version}
                className="rounded-lg border border-border-soft p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={() =>
                      setOpen(open === v.version ? null : v.version)
                    }
                    className="text-left text-sm"
                  >
                    <span className="font-medium">v{v.version}</span>
                    {v.version === current && (
                      <span className="ml-1.5 text-xs text-accent">
                        current
                      </span>
                    )}
                    <span className="ml-2 text-xs text-muted">
                      {new Date(v.createdAt).toLocaleString()}
                      {v.savedByName && ` · ${v.savedByName}`} ·{" "}
                      {v.snapshot.items.length} items
                    </span>
                  </button>
                  {v.version !== current && (
                    <button
                      disabled={busy}
                      onClick={() => restore(v)}
                      className="rounded-lg border border-border px-3 py-1 text-xs font-medium hover:bg-hover disabled:opacity-50"
                    >
                      Restore
                    </button>
                  )}
                </div>
                {open === v.version && (
                  <ul className="mt-2 space-y-0.5 text-sm text-muted">
                    {v.snapshot.items.map((i, n) => (
                      <li key={n} className={i.indent ? "ml-4" : ""}>
                        {i.section &&
                        i.section !== v.snapshot.items[n - 1]?.section
                          ? `${i.section}: `
                          : ""}
                        {i.text}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-hover"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function TemplateEditor({
  template,
  imported,
  onClose,
  onSaved,
}: {
  template: ApiTemplate | null
  imported: ImportedDraft | null
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState(template?.title ?? imported?.title ?? '')
  const [description, setDescription] = useState(template?.description ?? '')
  const [category, setCategory] = useState(template?.category ?? 'general')
  const [recurrence, setRecurrence] = useState(template?.recurrence ?? 'none')
  const [requiresSignOff, setRequiresSignOff] = useState(template?.requiresSignOff ?? false)
  const [items, setItems] = useState<DraftItem[]>(() => {
    const source = template?.items ?? imported?.items.map((i) => ({ ...i, priority: null }))
    return source ? itemsToRows(source) : [{ text: '', priority: '', uid: newUid() }]
  })
  const [fields, setFields] = useState<DraftField[]>(
    template?.customFields.map((f) => ({
      name: f.name,
      type: f.type,
      options: (JSON.parse(f.options) as string[]).join(', '),
      required: f.required,
    })) ??
      imported?.fields.map((name) => ({ name, type: 'text', options: '', required: false })) ??
      []
  )
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      let section = ''
      const uidToIdx = new Map<string, number>()
      const body = {
        title: title.trim(),
        description: description.trim(),
        category: category.trim() || 'general',
        recurrence,
        requiresSignOff,
        items: items.reduce<
          {
            text: string
            priority: string | null
            section: string
            indent: number
            conditionIndex: number | null
            conditionResult: string
            dueOffsetDays: number | null
          }[]
        >(
          (acc, row) => {
            const text = row.text.trim()
            if (row.heading) section = text
            else if (text) {
              // A subtask needs an item above it in the same section.
              const indent = row.indent && acc.length > 0 && acc[acc.length - 1].section === section ? 1 : 0
              const controller = row.condUid ? uidToIdx.get(row.condUid) : undefined
              if (row.uid) uidToIdx.set(row.uid, acc.length)
              const days = row.offset?.trim() ? Math.max(0, Math.min(365, Math.round(Number(row.offset)))) : null
              acc.push({
                text,
                priority: row.priority || null,
                section,
                indent,
                conditionIndex: controller ?? null,
                conditionResult: controller != null ? row.condResult || 'fail' : '',
                dueOffsetDays: days != null && Number.isFinite(days) ? days : null,
              })
            }
            return acc
          },
          []
        ),
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
        className="my-8 w-full max-w-2xl space-y-4 rounded-2xl border border-border bg-panel p-5 shadow-xl"
      >
        <h2 className="text-lg font-semibold">
          {template ? 'Edit template' : imported ? 'Review imported template' : 'New template'}
        </h2>
        {imported && (
          <p className="text-sm text-muted">
            {imported.items.length} items read from the file. Check them over, then save — nothing
            is created until you do.
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full rounded-lg border border-border bg-field px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-border bg-field px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Category</label>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border border-border bg-field px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Repeats</label>
            <select
              value={recurrence}
              onChange={(e) => setRecurrence(e.target.value)}
              className="w-full rounded-lg border border-border bg-field px-3 py-2 text-sm"
            >
              {RECURRENCES.map((r) => (
                <option key={r} value={r}>
                  {r === 'none' ? 'Does not repeat' : r}
                </option>
              ))}
            </select>
            {recurrence !== 'none' && (
              <p className="mt-1 text-xs text-faint">
                Completing a checklist made from this template automatically creates the next one.
              </p>
            )}
          </div>
        </div>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={requiresSignOff}
            onChange={(e) => setRequiresSignOff(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-accent"
          />
          <span>
            Require manager sign-off
            <span className="block text-xs text-faint">
              Once finished, a manager or admin (not the person who finished it) must approve it.
            </span>
          </span>
        </label>

        {/* Items */}
        <div>
          <label className="mb-1 block text-sm font-medium">Checklist items</label>
          <div className="space-y-2">
            {items.map((item, idx) => (
              <div key={item.uid ?? idx} className={cn(item.indent && 'ml-8')}>
              <div className="flex gap-2">
                <input
                  value={item.text}
                  onChange={(e) =>
                    setItems(items.map((it, i) => (i === idx ? { ...it, text: e.target.value } : it)))
                  }
                  placeholder={item.heading ? 'Section heading' : `Item ${idx + 1}`}
                  className={cn(
                    'flex-1 rounded-lg border border-border bg-field px-3 py-2 text-sm',
                    item.heading && 'bg-hover font-semibold'
                  )}
                />
                {!item.heading && (
                  <select
                    value={item.priority}
                    onChange={(e) =>
                      setItems(
                        items.map((it, i) => (i === idx ? { ...it, priority: e.target.value } : it))
                      )
                    }
                    className="w-28 rounded-lg border border-border bg-field px-2 py-2 text-sm"
                  >
                    <option value="">No priority</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                )}
                {!item.heading && (
                  <button
                    type="button"
                    title={item.indent ? 'Make a top-level item' : 'Make a subtask of the item above'}
                    onClick={() =>
                      setItems(
                        items.map((it, i) => (i === idx ? { ...it, indent: it.indent ? 0 : 1 } : it))
                      )
                    }
                    className="rounded p-2 text-muted hover:bg-hover hover:text-ink"
                  >
                    {item.indent ? <Outdent className="h-4 w-4" /> : <Indent className="h-4 w-4" />}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setItems(items.filter((_, i) => i !== idx))}
                  className="rounded p-2 text-danger/50 hover:bg-danger-soft hover:text-danger"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              {!item.heading && (
                <div className="mt-1 flex flex-wrap items-center gap-2 pl-1 text-xs text-muted">
                  {items.slice(0, idx).some((r) => !r.heading && r.uid) && (
                    <>
                      <span>Only if</span>
                      <select
                        value={item.condUid ?? ''}
                        onChange={(e) =>
                          setItems(items.map((it, i) => (i === idx ? { ...it, condUid: e.target.value || undefined } : it)))
                        }
                        className="max-w-48 rounded border border-border bg-field px-1.5 py-1 text-xs"
                      >
                        <option value="">always shown</option>
                        {items.slice(0, idx).map((r, n) =>
                          !r.heading && r.uid ? (
                            <option key={r.uid} value={r.uid}>
                              {r.text.trim() ? r.text.slice(0, 30) : `Item ${n + 1}`}
                            </option>
                          ) : null
                        )}
                      </select>
                      {item.condUid && (
                        <select
                          value={item.condResult ?? 'fail'}
                          onChange={(e) =>
                            setItems(items.map((it, i) => (i === idx ? { ...it, condResult: e.target.value } : it)))
                          }
                          className="rounded border border-border bg-field px-1.5 py-1 text-xs"
                        >
                          <option value="pass">is Pass</option>
                          <option value="fail">is Fail</option>
                          <option value="na">is N/A</option>
                        </select>
                      )}
                    </>
                  )}
                  <span className="ml-auto">Due</span>
                  <input
                    type="number"
                    min={0}
                    max={365}
                    value={item.offset ?? ''}
                    onChange={(e) =>
                      setItems(items.map((it, i) => (i === idx ? { ...it, offset: e.target.value } : it)))
                    }
                    placeholder="—"
                    className="w-14 rounded border border-border bg-field px-1.5 py-1 text-xs"
                  />
                  <span>days before list</span>
                </div>
              )}
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-4">
            <button
              type="button"
              onClick={() => setItems([...items, { text: '', priority: '', uid: newUid() }])}
              className="flex items-center gap-1 text-sm text-accent hover:underline"
            >
              <Plus className="h-4 w-4" /> Add item
            </button>
            <button
              type="button"
              onClick={() => setItems([...items, { text: '', priority: '', heading: true }])}
              className="flex items-center gap-1 text-sm text-accent hover:underline"
            >
              <Plus className="h-4 w-4" /> Add section
            </button>
          </div>
        </div>

        {/* Custom fields */}
        <div>
          <label className="mb-1 block text-sm font-medium">
            Custom fields{' '}
            <span className="font-normal text-faint">
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
                  className="w-40 rounded-lg border border-border bg-field px-3 py-2 text-sm"
                />
                <select
                  value={f.type}
                  onChange={(e) =>
                    setFields(fields.map((x, i) => (i === idx ? { ...x, type: e.target.value } : x)))
                  }
                  className="rounded-lg border border-border bg-field px-2 py-2 text-sm"
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
                    className="flex-1 rounded-lg border border-border bg-field px-3 py-2 text-sm"
                  />
                )}
                <button
                  type="button"
                  onClick={() => setFields(fields.filter((_, i) => i !== idx))}
                  className="rounded p-2 text-danger/50 hover:bg-danger-soft hover:text-danger"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setFields([...fields, { name: '', type: 'text', options: '', required: true }])}
            className="mt-2 flex items-center gap-1 text-sm text-accent hover:underline"
          >
            <Plus className="h-4 w-4" /> Add field
          </button>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-hover"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-2 disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save template'}
          </button>
        </div>
      </form>
    </div>
  )
}
