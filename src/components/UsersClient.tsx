'use client'

import { useCallback, useEffect, useState } from 'react'
import { KeyRound, Plus, Trash2 } from 'lucide-react'
import type { ApiUser } from '@/lib/types'

export function UsersClient({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<ApiUser[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const res = await fetch('/api/users')
    if (res.ok) setUsers((await res.json()).users)
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

      {showCreate && (
        <CreateUserModal
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
