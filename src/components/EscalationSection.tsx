'use client'

import { useEffect, useState } from 'react'

// Primary-admin: tell managers when a list has been overdue for N days.
export function EscalationSection() {
  const [days, setDays] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/settings/escalation')
      .then((res) => res.json())
      .then((data) => setDays(String(data.days ?? 0)))
      .catch(() => undefined)
  }, [])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setMessage('')
    const res = await fetch('/api/settings/escalation', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ days: Number(days) }),
    })
    if (res.ok) setMessage('Saved.')
    else setError('Enter a whole number of days from 0 to 365.')
  }

  return (
    <section className="rounded-xl border border-border bg-panel p-5">
      <h2 className="font-semibold">Escalate overdue lists</h2>
      <p className="mt-0.5 text-sm text-muted">
        Each morning at 08:00, admins and managers are notified (in-app, push and email) about
        active lists that have been overdue for this many days. Each list is escalated once.
        Set 0 to switch off.
      </p>
      <form onSubmit={save} className="mt-3 flex items-end gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium">Days overdue</label>
          <input
            type="number"
            min={0}
            max={365}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className="w-28 rounded-lg border border-border bg-field px-3 py-2 text-sm focus:border-accent focus:outline-none"
          />
        </div>
        <button type="submit" className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-hover">
          Save
        </button>
      </form>
      {message && <p className="mt-2 text-sm text-green-600">{message}</p>}
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </section>
  )
}
