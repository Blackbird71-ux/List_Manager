'use client'

import { useCallback, useEffect, useState } from 'react'
import { KeyRound, Pencil, Plus, Trash2, Users2 } from 'lucide-react'
import type { ApiDepartment, ApiUser } from '@/lib/types'

export function UsersClient({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<ApiUser[]>([])
  const [departments, setDepartments] = useState<ApiDepartment[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editMembers, setEditMembers] = useState<ApiDepartment | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [usersRes, deptRes] = await Promise.all([fetch('/api/users'), fetch('/api/departments')])
    if (usersRes.ok) setUsers((await usersRes.json()).users)
    if (deptRes.ok) setDepartments((await deptRes.json()).departments)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function setRole(user: ApiUser, role: string) {
    setError('')
    const res = await fetch(`/api/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Could not change the role')
    }
    load()
  }

  async function resetPassword(user: ApiUser) {
    const password = prompt(`New password for ${user.name} (min 8 characters):`)
    if (!password) return
    setError('')
    const res = await fetch(`/api/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Could not reset the password')
    } else {
      alert('Password updated.')
    }
  }

  async function remove(user: ApiUser) {
    if (!confirm(`Delete ${user.name}'s account?`)) return
    setError('')
    const res = await fetch(`/api/users/${user.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Could not delete the user')
    }
    load()
  }

  async function addDepartment() {
    const name = prompt('Department name:')?.trim()
    if (!name) return
    setError('')
    const res = await fetch('/api/departments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Could not create the department')
    }
    load()
  }

  async function renameDepartment(dept: ApiDepartment) {
    const name = prompt('New department name:', dept.name)?.trim()
    if (!name || name === dept.name) return
    setError('')
    const res = await fetch(`/api/departments/${dept.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Could not rename the department')
    }
    load()
  }

  async function removeDepartment(dept: ApiDepartment) {
    if (!confirm(`Delete the "${dept.name}" department? Checklists limited to it will only stay visible to their creator, assignees and managers.`)) return
    setError('')
    const res = await fetch(`/api/departments/${dept.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Could not delete the department')
    }
    load()
  }

  if (loading) {
    return <p className="py-12 text-center text-sm text-faint">Loading…</p>
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center">
        <h1 className="text-lg font-semibold">Users</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="ml-auto flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-2"
        >
          <Plus className="h-4 w-4" /> Add user
        </button>
      </div>

      {error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="overflow-hidden rounded-xl border border-border bg-panel">
        {users.map((u) => (
          <div
            key={u.id}
            className="flex flex-wrap items-center gap-3 border-b border-border-soft px-4 py-3 last:border-b-0"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {u.name}
                {u.id === currentUserId && (
                  <span className="ml-2 text-xs font-normal text-faint">(you)</span>
                )}
              </p>
              <p className="text-xs text-muted">{u.email}</p>
              {(u.departments?.length ?? 0) > 0 && (
                <p className="text-xs text-faint">
                  {u.departments!.map((d) => d.department.name).join(', ')}
                </p>
              )}
            </div>
            <select
              value={u.role}
              onChange={(e) => setRole(u, e.target.value)}
              className="rounded-lg border border-border bg-field px-2 py-1.5 text-sm"
            >
              <option value="member">Member</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
            <button
              onClick={() => resetPassword(u)}
              className="rounded p-2 text-muted hover:bg-hover"
              title="Reset password"
            >
              <KeyRound className="h-4 w-4" />
            </button>
            <button
              onClick={() => remove(u)}
              disabled={u.id === currentUserId}
              className="rounded p-2 text-danger/50 hover:bg-danger-soft hover:text-danger disabled:opacity-30"
              title="Delete user"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center pt-4">
        <h2 className="text-lg font-semibold">Departments</h2>
        <button
          onClick={addDepartment}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-border bg-panel px-3 py-2 text-sm font-medium hover:bg-hover"
        >
          <Plus className="h-4 w-4" /> Add department
        </button>
      </div>
      <p className="text-sm text-muted">
        Checklists with &ldquo;department&rdquo; visibility are only shown to members of their
        departments. Managers and admins always see everything.
      </p>

      {departments.length === 0 ? (
        <p className="rounded-xl border border-border bg-panel px-4 py-6 text-center text-sm text-faint">
          No departments yet.
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-panel">
          {departments.map((d) => (
            <div
              key={d.id}
              className="flex flex-wrap items-center gap-3 border-b border-border-soft px-4 py-3 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{d.name}</p>
                <p className="text-xs text-muted">
                  {d.members.length === 0
                    ? 'No members'
                    : d.members.map((m) => m.user.name).join(', ')}
                </p>
              </div>
              <button
                onClick={() => setEditMembers(d)}
                className="rounded p-2 text-muted hover:bg-hover"
                title="Edit members"
              >
                <Users2 className="h-4 w-4" />
              </button>
              <button
                onClick={() => renameDepartment(d)}
                className="rounded p-2 text-muted hover:bg-hover"
                title="Rename department"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                onClick={() => removeDepartment(d)}
                className="rounded p-2 text-danger/50 hover:bg-danger-soft hover:text-danger"
                title="Delete department"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false)
            load()
          }}
        />
      )}

      {editMembers && (
        <DepartmentMembersModal
          department={editMembers}
          users={users}
          onClose={() => setEditMembers(null)}
          onSaved={() => {
            setEditMembers(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function DepartmentMembersModal({
  department,
  users,
  onClose,
  onSaved,
}: {
  department: ApiDepartment
  users: ApiUser[]
  onClose: () => void
  onSaved: () => void
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(department.members.map((m) => m.user.id))
  )
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function save() {
    setError('')
    setBusy(true)
    try {
      const res = await fetch(`/api/departments/${department.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberIds: Array.from(selected) }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Could not save the members')
        return
      }
      onSaved()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-sm space-y-3 rounded-2xl border border-border bg-panel p-5 shadow-xl">
        <h2 className="text-lg font-semibold">{department.name} members</h2>
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {users.map((u) => (
            <label
              key={u.id}
              className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-hover"
            >
              <input
                type="checkbox"
                checked={selected.has(u.id)}
                onChange={() => toggle(u.id)}
                className="h-4 w-4"
              />
              <span className="min-w-0 flex-1 truncate">{u.name}</span>
              <span className="text-xs text-faint">{u.role}</span>
            </label>
          ))}
        </div>

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
            onClick={save}
            disabled={busy}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-2 disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save members'}
          </button>
        </div>
      </div>
    </div>
  )
}

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('member')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, role }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Could not create the user')
        return
      }
      onCreated()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-3 rounded-2xl border border-border bg-panel p-5 shadow-xl">
        <h2 className="text-lg font-semibold">Add user</h2>
        <div>
          <label className="mb-1 block text-sm font-medium">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full rounded-lg border border-border bg-field px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-lg border border-border bg-field px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="w-full rounded-lg border border-border bg-field px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full rounded-lg border border-border bg-field px-3 py-2 text-sm"
          >
            <option value="member">Member</option>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
          </select>
        </div>

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
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-2 disabled:opacity-50"
          >
            {busy ? 'Creating…' : 'Create user'}
          </button>
        </div>
      </form>
    </div>
  )
}
