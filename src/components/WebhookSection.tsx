'use client'

import { useEffect, useState } from 'react'

// Primary-admin: POST a signed JSON event when a list is completed or signed off.
export function WebhookSection() {
  const [url, setUrl] = useState('')
  const [secret, setSecret] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/settings/webhook')
      .then((res) => res.json())
      .then((data) => {
        setUrl(data.url ?? '')
        setSecret(data.secret ?? '')
      })
      .catch(() => undefined)
  }, [])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setMessage('')
    const res = await fetch('/api/settings/webhook', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
    const data = await res.json().catch(() => ({}))
    if (res.ok) {
      setSecret(data.secret)
      setMessage('Saved.')
    } else setError(data.error ?? 'Could not save.')
  }

  async function remove() {
    setError('')
    const res = await fetch('/api/settings/webhook', { method: 'DELETE' })
    if (res.ok) {
      setUrl('')
      setSecret('')
      setMessage('Webhook removed.')
    }
  }

  return (
    <section className="rounded-xl border border-border bg-panel p-5">
      <h2 className="font-semibold">Webhook</h2>
      <p className="mt-0.5 text-sm text-muted">
        When a list in the primary organisation is completed or signed off, a JSON event is posted to
        this address. Requests are signed: the X-ListsManager-Signature header is &quot;sha256=&quot;
        followed by the HMAC-SHA256 of the body using the secret below. Only public https addresses
        are allowed.
      </p>
      <form onSubmit={save} className="mt-3 space-y-3">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/hooks/lists"
          required
          className="w-full rounded-lg border border-border bg-field px-3 py-2 text-sm focus:border-accent focus:outline-none"
        />
        {secret && (
          <p className="text-xs text-muted">
            Signing secret: <code className="break-all rounded bg-hover px-1">{secret}</code>
          </p>
        )}
        <div className="flex gap-2">
          <button type="submit" className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-hover">
            Save
          </button>
          {secret && (
            <button type="button" onClick={remove} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-hover">
              Remove
            </button>
          )}
        </div>
      </form>
      {message && <p className="mt-2 text-sm text-green-600">{message}</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  )
}
