'use client'

import { useEffect, useState } from 'react'

// Per-user secret iCal link for Outlook / Google / Apple Calendar.
export function CalendarFeedSection() {
  const [createdAt, setCreatedAt] = useState<string | null | undefined>(undefined)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/settings/calendar-feed')
      .then((r) => r.json())
      .then((d) => setCreatedAt(d.createdAt ?? null))
      .catch(() => setError('Could not load this setting.'))
  }, [])

  async function call(method: 'POST' | 'DELETE') {
    if (method === 'POST' && createdAt && !confirm('Create a new link? The current link will stop working in any calendar using it.')) return
    if (method === 'DELETE' && !confirm('Turn off the calendar link? Calendars subscribed to it will stop updating.')) return
    setError('')
    setBusy(true)
    try {
      const res = await fetch('/api/settings/calendar-feed', { method })
      if (!res.ok) throw new Error()
      const d = await res.json()
      setCreatedAt(d.createdAt ?? null)
      setUrl(d.url ?? '')
      setCopied(false)
    } catch {
      setError('Could not save this setting.')
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      setError('Could not copy — select the link and copy it manually.')
    }
  }

  return (
    <section className="rounded-xl border border-border bg-panel p-5">
      <h2 className="font-semibold">Calendar subscription</h2>
      <p className="mt-0.5 text-sm text-muted">
        See your due dates in Outlook, Google or Apple Calendar. The link shows what you can see in the app and updates
        automatically (calendar apps refresh every few hours). Keep it private — anyone with the link can read it.
      </p>

      {url && (
        <div className="mt-3 space-y-2 rounded-lg border border-border bg-hover/40 p-3">
          <p className="text-sm font-medium">Your link — copy it now, it is only shown once:</p>
          <input
            readOnly
            value={url}
            onFocus={(e) => e.target.select()}
            className="w-full rounded-lg border border-border bg-panel px-3 py-2 font-mono text-xs"
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={copy} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink">
              {copied ? 'Copied' : 'Copy link'}
            </button>
            <a
              href={url.replace(/^https?:/, 'webcal:')}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-hover"
            >
              Open in calendar app
            </a>
          </div>
          <p className="text-xs text-muted">
            Outlook: Add calendar → Subscribe from web. Google Calendar: Other calendars → From URL. Google needs the
            app to be reachable from the internet (your tunnel address), not just your home network.
          </p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {createdAt === null && (
          <button
            type="button"
            onClick={() => call('POST')}
            disabled={busy}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-hover disabled:opacity-50"
          >
            Create calendar link
          </button>
        )}
        {createdAt && (
          <>
            <span className="text-sm text-ok">On since {new Date(createdAt).toLocaleDateString()}</span>
            <button
              type="button"
              onClick={() => call('POST')}
              disabled={busy}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-hover disabled:opacity-50"
            >
              {url ? 'Create another' : 'Lost it? Create a new link'}
            </button>
            <button
              type="button"
              onClick={() => call('DELETE')}
              disabled={busy}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-danger hover:bg-hover disabled:opacity-50"
            >
              Turn off
            </button>
          </>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </section>
  )
}
