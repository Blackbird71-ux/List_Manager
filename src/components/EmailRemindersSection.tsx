'use client'

import { useEffect, useState } from 'react'

// Per-user toggle for emailed due/overdue reminders.
export function EmailRemindersSection() {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/settings/email-reminders')
      .then((r) => r.json())
      .then((d) => setEnabled(Boolean(d.enabled)))
      .catch(() => setError('Could not load this setting.'))
  }, [])

  async function toggle() {
    if (enabled === null) return
    setError('')
    setBusy(true)
    try {
      const res = await fetch('/api/settings/email-reminders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !enabled }),
      })
      if (!res.ok) throw new Error()
      setEnabled(!enabled)
    } catch {
      setError('Could not save this setting.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-xl border border-border bg-panel p-5">
      <h2 className="font-semibold">Email reminders</h2>
      <p className="mt-0.5 text-sm text-muted">
        Get an email when a checklist is due soon or overdue. Sent to the address you sign in with.
      </p>
      <div className="mt-3 flex items-center gap-3">
        {enabled !== null && (
          <>
            <span className={`text-sm ${enabled ? 'text-ok' : 'text-muted'}`}>
              {enabled ? 'On' : 'Off'}
            </span>
            <button
              onClick={toggle}
              disabled={busy}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-hover disabled:opacity-50"
            >
              {enabled ? 'Turn off' : 'Turn on'}
            </button>
          </>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </section>
  )
}
