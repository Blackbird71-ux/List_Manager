'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { ClipboardList } from 'lucide-react'

type Mode = 'signin' | 'register'
type RegisterMode = 'create' | 'join'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('signin')
  const [registerMode, setRegisterMode] = useState<RegisterMode>('create')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [organizationName, setOrganizationName] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('reset') === '1') {
      setNotice('Password updated — sign in with your new password.')
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (mode === 'register') {
        const res = await fetch('/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            email,
            password,
            ...(registerMode === 'create'
              ? { organizationName }
              : { inviteCode: inviteCode.trim() }),
          }),
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

  const registering = mode === 'register'
  const inputClass =
    'w-full rounded-lg border border-border bg-field px-3 py-2 text-sm focus:border-accent focus:outline-none'

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2">
          <div className="rounded-2xl bg-accent p-3">
            <ClipboardList className="h-7 w-7 text-accent-ink" />
          </div>
          <h1 className="text-xl font-semibold">Lists Manager</h1>
          {registering && (
            <p className="text-center text-sm text-muted">
              Set up a new organisation, or join one with its invite code.
            </p>
          )}
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-3 rounded-2xl border border-border bg-panel p-6 shadow-sm"
        >
          {registering && (
            <>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Registration type">
                <button
                  type="button"
                  onClick={() => setRegisterMode('create')}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                    registerMode === 'create'
                      ? 'border-accent bg-accent text-accent-ink'
                      : 'border-border bg-field text-muted hover:text-ink'
                  }`}
                >
                  Create organisation
                </button>
                <button
                  type="button"
                  onClick={() => setRegisterMode('join')}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                    registerMode === 'join'
                      ? 'border-accent bg-accent text-accent-ink'
                      : 'border-border bg-field text-muted hover:text-ink'
                  }`}
                >
                  Join with code
                </button>
              </div>
              {registerMode === 'create' ? (
                <div>
                  <label className="mb-1 block text-sm font-medium text-ink">
                    Company or family name
                  </label>
                  <input
                    value={organizationName}
                    onChange={(e) => setOrganizationName(e.target.value)}
                    required
                    placeholder="e.g. Acme Pty Ltd or The Smiths"
                    className={inputClass}
                  />
                  <p className="mt-1 text-xs text-muted">
                    You&apos;ll be the admin of this organisation.
                  </p>
                </div>
              ) : (
                <div>
                  <label className="mb-1 block text-sm font-medium text-ink">Invite code</label>
                  <input
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    required
                    placeholder="Ask your admin for the code"
                    className={inputClass}
                  />
                </div>
              )}
              <div>
                <label className="mb-1 block text-sm font-medium text-ink">Your name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} required className={inputClass} />
              </div>
            </>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={registering ? 8 : undefined}
              autoComplete={registering ? 'new-password' : 'current-password'}
              className={inputClass}
            />
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}
          {notice && !error && <p className="text-sm text-ink">{notice}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-accent py-2 text-sm font-semibold text-accent-ink hover:bg-accent-2 disabled:opacity-50"
          >
            {busy ? 'Please wait…' : registering ? 'Create account' : 'Sign in'}
          </button>

          <p className="text-center text-sm">
            {registering ? (
              <button
                type="button"
                onClick={() => { setMode('signin'); setError('') }}
                className="text-accent hover:underline"
              >
                Already have an account? Sign in
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => { setMode('register'); setError('') }}
                  className="text-accent hover:underline"
                >
                  Create an account
                </button>
                <span className="mx-2 text-muted">·</span>
                <a href="/reset-password" className="text-accent hover:underline">
                  Forgot password?
                </a>
              </>
            )}
          </p>
        </form>
      </div>
    </div>
  )
}
