'use client'

import { useEffect, useState } from 'react'

// Admin-only: SMTP settings for password-reset emails, stored in the app
// database (never in .env files). Blank password on save keeps the stored one.
export function EmailSection() {
  const [host, setHost] = useState('smtp.gmail.com')
  const [port, setPort] = useState('587')
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [from, setFrom] = useState('')
  const [hasPassword, setHasPassword] = useState(false)
  const [status, setStatus] = useState<'idle' | 'busy' | 'saved' | 'testing' | 'tested'>('idle')
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/settings/email')
      .then((res) => res.json())
      .then((data) => {
        if (data.smtp) {
          setHost(data.smtp.host)
          setPort(String(data.smtp.port))
          setUser(data.smtp.user)
          setFrom(data.smtp.from ?? '')
          setHasPassword(Boolean(data.smtp.hasPassword))
        }
      })
      .catch(() => undefined)
  }, [])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setStatus('busy')
    const res = await fetch('/api/settings/email', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host, port: Number(port), user, pass, from }),
    })
    if (res.ok) {
      setStatus('saved')
      setPass('')
      setHasPassword(true)
    } else {
      setStatus('idle')
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Could not save email settings.')
    }
  }

  async function sendTest() {
    setError('')
    setStatus('testing')
    const res = await fetch('/api/settings/email/test', { method: 'POST' })
    if (res.ok) {
      setStatus('tested')
    } else {
      setStatus('idle')
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Test email failed.')
    }
  }

  return (
    <section className="rounded-xl border border-border bg-panel p-5">
      <h2 className="font-semibold">Email (password resets)</h2>
      <p className="mt-0.5 text-sm text-muted">
        Used to send &quot;Forgot password?&quot; links. For Gmail, use an app password from
        myaccount.google.com/apppasswords — not your real password. Stored in the app database,
        visible only to admins.
      </p>
      <form onSubmit={save} className="mt-3 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">SMTP host</label>
            <input
              value={host}
              onChange={(e) => setHost(e.target.value)}
              required
              className="w-full rounded-lg border border-border bg-field px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Port</label>
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              required
              min={1}
              max={65535}
              className="w-full rounded-lg border border-border bg-field px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Username</label>
          <input
            type="text"
            value={user}
            placeholder="whatever your mail provider requires — often an email address"
            onChange={(e) => setUser(e.target.value)}
            required
            className="w-full rounded-lg border border-border bg-field px-3 py-2 text-sm focus:border-accent focus:outline-none"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">App password</label>
            <input
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              placeholder={hasPassword ? '•••••••• (saved — blank keeps it)' : ''}
              required={!hasPassword}
              autoComplete="off"
              className="w-full rounded-lg border border-border bg-field px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">From address (optional)</label>
            <input
              type="email"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              placeholder="defaults to username"
              className="w-full rounded-lg border border-border bg-field px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />
          </div>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={status === 'busy' || status === 'testing'}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-2 disabled:opacity-50"
          >
            {status === 'busy' ? 'Saving…' : 'Save email settings'}
          </button>
          <button
            type="button"
            onClick={sendTest}
            disabled={!hasPassword || status === 'busy' || status === 'testing'}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-hover disabled:opacity-50"
          >
            {status === 'testing' ? 'Sending…' : 'Send test email'}
          </button>
          {status === 'saved' && <span className="text-sm text-ok">Saved.</span>}
          {status === 'tested' && <span className="text-sm text-ok">Test email sent — check your inbox.</span>}
        </div>
      </form>
    </section>
  )
}
