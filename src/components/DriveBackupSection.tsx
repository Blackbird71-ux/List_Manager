'use client'

import { useEffect, useState } from 'react'

interface LastRun {
  at: string
  ok: boolean
  error?: string
  dbFile?: string
  attachmentsUploaded?: number
  attachmentsTotal?: number
}

interface DriveState {
  clientId: string
  hasSecret: boolean
  connected: boolean
  email: string | null
  redirectUri: string
  last: LastRun | null
}

// Admin-only: nightly backup of the database and uploaded files to Google Drive.
// Client id/secret are stored in the app database; the secret is never sent back.
export function DriveBackupSection() {
  const [state, setState] = useState<DriveState | null>(null)
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [busy, setBusy] = useState<'' | 'save' | 'connect' | 'run' | 'disconnect'>('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  function load() {
    return fetch('/api/settings/drive-backup')
      .then((res) => res.json())
      .then((data: DriveState) => {
        setState(data)
        setClientId(data.clientId)
      })
      .catch(() => undefined)
  }

  useEffect(() => {
    load()
    const result = new URLSearchParams(window.location.search).get('drive')
    if (result === 'connected') setMessage('Google Drive connected.')
    else if (result) setError('Could not connect Google Drive. Check the client ID, secret and redirect URI, then try again.')
  }, [])

  async function call(kind: typeof busy, url: string, init?: RequestInit) {
    setError('')
    setMessage('')
    setBusy(kind)
    try {
      const res = await fetch(url, init)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) setError(data.error ?? 'Request failed.')
      return res.ok ? data : null
    } finally {
      setBusy('')
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const ok = await call('save', '/api/settings/drive-backup', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, clientSecret }),
    })
    if (ok) {
      setClientSecret('')
      setMessage('Saved.')
      load()
    }
  }

  async function connect() {
    const data = await call('connect', '/api/settings/drive-backup/connect')
    if (data?.url) window.location.href = data.url
  }

  async function backUpNow() {
    const data = await call('run', '/api/settings/drive-backup/run', { method: 'POST' })
    if (data) {
      if (!data.ok) setError(data.error ?? 'Backup failed.')
      else setMessage('Backup complete.')
      load()
    }
  }

  async function disconnect() {
    if (!window.confirm('Disconnect Google Drive? Backups already on Drive are kept.')) return
    if (await call('disconnect', '/api/settings/drive-backup', { method: 'DELETE' })) load()
  }

  const field = 'w-full rounded-lg border border-border bg-field px-3 py-2 text-sm focus:border-accent focus:outline-none'
  const last = state?.last

  return (
    <section className="rounded-xl border border-border bg-panel p-5">
      <h2 className="font-semibold">Google Drive backup</h2>
      <p className="mt-0.5 text-sm text-muted">
        Every night at 03:30 a copy of the database and any new uploaded files is sent to a
        &quot;Lists Manager Backups&quot; folder in your Google Drive. The last 30 database copies are kept.
      </p>

      <form onSubmit={save} className="mt-3 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Google client ID</label>
            <input value={clientId} onChange={(e) => setClientId(e.target.value)} required className={field} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Google client secret</label>
            <input
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder={state?.hasSecret ? '•••••••• (saved — blank keeps it)' : ''}
              required={!state?.hasSecret}
              autoComplete="off"
              className={field}
            />
          </div>
        </div>
        {state && (
          <p className="text-xs text-muted">
            In Google Cloud Console, create an OAuth client (Web application) and add this authorised redirect URI:{' '}
            <code className="break-all rounded bg-hover px-1">{state.redirectUri}</code>. Connect from the https
            address of the app — Google rejects plain http.
          </p>
        )}
        <button
          type="submit"
          disabled={busy !== ''}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-hover disabled:opacity-50"
        >
          {busy === 'save' ? 'Saving…' : 'Save client'}
        </button>
      </form>

      <div className="mt-4 space-y-2 border-t border-border pt-4">
        <p className="text-sm">
          {state?.connected ? (
            <>Connected{state.email ? <> as <strong>{state.email}</strong></> : null}.</>
          ) : (
            <span className="text-muted">Not connected — no backups are being sent to Drive.</span>
          )}
        </p>
        {last && (
          <p className={last.ok ? 'text-sm text-muted' : 'text-sm text-danger'}>
            Last backup {new Date(last.at).toLocaleString()}:{' '}
            {last.ok
              ? `OK — ${last.dbFile}, ${last.attachmentsUploaded ?? 0} new of ${last.attachmentsTotal ?? 0} files`
              : `failed — ${last.error}`}
          </p>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
        {message && <p className="text-sm text-ok">{message}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={connect}
            disabled={!state?.hasSecret || busy !== ''}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-2 disabled:opacity-50"
          >
            {busy === 'connect' ? 'Opening Google…' : state?.connected ? 'Reconnect Google Drive' : 'Connect Google Drive'}
          </button>
          {state?.connected && (
            <>
              <button
                type="button"
                onClick={backUpNow}
                disabled={busy !== ''}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-hover disabled:opacity-50"
              >
                {busy === 'run' ? 'Backing up…' : 'Back up now'}
              </button>
              <button
                type="button"
                onClick={disconnect}
                disabled={busy !== ''}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-danger hover:bg-hover disabled:opacity-50"
              >
                Disconnect
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  )
}
