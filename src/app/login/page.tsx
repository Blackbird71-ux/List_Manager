'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { ClipboardList } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [bootstrap, setBootstrap] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('reset') === '1') {
      setNotice('Password updated — sign in with your new password.')
    }
    fetch('/api/register')
      .then((res) => res.json())
      .then((data) => setBootstrap(Boolean(data.open)))
      .catch(() => undefined)
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (bootstrap) {
        const res = await fetch('/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          setError(data.error ?? 'Could not create the account')
          return
        }
      }
      const result = await signIn('credentials', { email, password, redirect: false })
      if (result?.error) {
        setError('Invalid email or password')
        return
      }
      router.push('/')
      router.refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="rounded-2xl bg-accent p-3">
            <ClipboardList className="h-7 w-7 text-accent-ink" />
          </div>
          <h1 className="text-xl font-semibold">Lists Manager</h1>
          {bootstrap && (
            <p className="text-center text-sm text-muted">
              Welcome! Create the first (admin) account to get started.
            </p>
          )}
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-3 rounded-2xl border border-border bg-panel p-6 shadow-sm"
        >
          {bootstrap && (
            <div>
              <label className="mb-1 block text-sm font-medium text-ink">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-lg border border-border bg-field px-3 py-2 text-sm focus:border-accent focus:outline-none"
              />
            </div>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full rounded-lg border border-border bg-field px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={bootstrap ? 8 : undefined}
              autoComplete={bootstrap ? 'new-password' : 'current-password'}
              className="w-full rounded-lg border border-border bg-field px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}
          {notice && !error && <p className="text-sm text-ink">{notice}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-accent py-2 text-sm font-semibold text-accent-ink hover:bg-accent-2 disabled:opacity-50"
          >
            {busy ? 'Please wait…' : bootstrap ? 'Create admin account' : 'Sign in'}
          </button>

          {!bootstrap && (
            <p className="text-center text-sm">
              <a href="/reset-password" className="text-accent hover:underline">
                Forgot password?
              </a>
            </p>
          )}
        </form>
      </div>
    </div>
  )
}
