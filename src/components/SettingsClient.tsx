'use client'

import { useEffect, useState } from 'react'
import { Check, Moon, Palette, Sun } from 'lucide-react'
import { cn } from '@/lib/utils'

type Theme = 'light' | 'iris' | 'dark'

const THEMES: { value: Theme; label: string; hint: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', hint: 'The classic slate & blue look', icon: Sun },
  { value: 'iris', label: 'Iris', hint: 'Iris & Ink — matches our other apps', icon: Palette },
  { value: 'dark', label: 'Dark', hint: 'Iris & Ink dark mode', icon: Moon },
]

function applyTheme(theme: Theme) {
  if (theme === 'light') {
    delete document.documentElement.dataset.theme
    localStorage.removeItem('lm-theme')
  } else {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('lm-theme', theme)
  }
}

export function SettingsClient({
  user,
}: {
  user: { id: string; name: string; email: string; role: string }
}) {
  const [theme, setTheme] = useState<Theme>('light')

  // Read the saved theme after mount (localStorage isn't available during SSR).
  useEffect(() => {
    const saved = localStorage.getItem('lm-theme')
    if (saved === 'iris' || saved === 'dark') setTheme(saved)
  }, [])

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-lg font-semibold">Settings</h1>

      {/* Theme */}
      <section className="rounded-xl border border-border bg-panel p-5">
        <h2 className="font-semibold">Theme</h2>
        <p className="mt-0.5 text-sm text-muted">Only changes how the app looks on this device.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {THEMES.map(({ value, label, hint, icon: Icon }) => (
            <button
              key={value}
              onClick={() => {
                setTheme(value)
                applyTheme(value)
              }}
              className={cn(
                'rounded-lg border p-3 text-left transition',
                theme === value
                  ? 'border-accent bg-accent-soft'
                  : 'border-border hover:bg-hover'
              )}
            >
              <span className="flex items-center gap-2 text-sm font-medium text-ink">
                <Icon className="h-4 w-4" />
                {label}
                {theme === value && <Check className="ml-auto h-4 w-4 text-accent" />}
              </span>
              <span className="mt-1 block text-xs text-faint">{hint}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Profile */}
      <ProfileSection user={user} />

      {/* Password */}
      <PasswordSection userId={user.id} />
    </div>
  )
}

function ProfileSection({
  user,
}: {
  user: { id: string; name: string; email: string; role: string }
}) {
  const [name, setName] = useState(user.name)
  const [status, setStatus] = useState<'idle' | 'busy' | 'saved' | 'error'>('idle')

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setStatus('busy')
    const res = await fetch(`/api/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    })
    setStatus(res.ok ? 'saved' : 'error')
  }

  return (
    <section className="rounded-xl border border-border bg-panel p-5">
      <h2 className="font-semibold">Profile</h2>
      <form onSubmit={save} className="mt-3 space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium">Display name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={100}
            className="w-full rounded-lg border border-border bg-field px-3 py-2 text-sm focus:border-accent focus:outline-none"
          />
        </div>
        <p className="text-xs text-faint">
          Signed in as {user.email} · role: {user.role}
        </p>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={status === 'busy' || name.trim() === ''}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-2 disabled:opacity-50"
          >
            {status === 'busy' ? 'Saving…' : 'Save name'}
          </button>
          {status === 'saved' && (
            <span className="text-sm text-ok">Saved — shows after your next sign-in.</span>
          )}
          {status === 'error' && <span className="text-sm text-danger">Could not save.</span>}
        </div>
      </form>
    </section>
  )
}

function PasswordSection({ userId }: { userId: string }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [status, setStatus] = useState<'idle' | 'busy' | 'saved'>('idle')
  const [error, setError] = useState('')

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirm) {
      setError('New passwords do not match.')
      return
    }
    setStatus('busy')
    const res = await fetch(`/api/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: newPassword, currentPassword }),
    })
    if (res.ok) {
      setStatus('saved')
      setCurrentPassword('')
      setNewPassword('')
      setConfirm('')
    } else {
      setStatus('idle')
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Could not change the password.')
    }
  }

  return (
    <section className="rounded-xl border border-border bg-panel p-5">
      <h2 className="font-semibold">Change password</h2>
      <form onSubmit={save} className="mt-3 space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium">Current password</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="w-full rounded-lg border border-border bg-field px-3 py-2 text-sm focus:border-accent focus:outline-none"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">New password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="w-full rounded-lg border border-border bg-field px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Confirm new password</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
              className="w-full rounded-lg border border-border bg-field px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </div>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={status === 'busy'}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-2 disabled:opacity-50"
          >
            {status === 'busy' ? 'Changing…' : 'Change password'}
          </button>
          {status === 'saved' && <span className="text-sm text-ok">Password changed.</span>}
        </div>
      </form>
    </section>
  )
}
