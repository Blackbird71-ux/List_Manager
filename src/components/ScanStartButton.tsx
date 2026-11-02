'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Play } from 'lucide-react'

// One-tap start from a scanned QR label, using the template's defaults.
export function ScanStartButton({ templateId, label }: { templateId: string; label: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function start() {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/checklists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? 'Could not start the checklist')
        return
      }
      router.push(`/checklists/${data.checklist.id}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-3 text-sm font-semibold text-accent-ink hover:bg-accent-2 disabled:opacity-50"
      >
        <Play className="h-4 w-4" /> {busy ? 'Starting…' : label}
      </button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </>
  )
}
