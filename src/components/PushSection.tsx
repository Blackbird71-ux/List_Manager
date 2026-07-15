'use client'

import { useEffect, useState } from 'react'

// Per-device web push toggle, available to every signed-in user. The
// subscription is stored server-side; VAPID keys live in the app database.

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

type PushState = 'loading' | 'unsupported' | 'blocked' | 'enabled' | 'disabled'

export function PushSection() {
  const [state, setState] = useState<PushState>('loading')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setState('unsupported')
      return
    }
    if (Notification.permission === 'denied') {
      setState('blocked')
      return
    }
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setState(sub ? 'enabled' : 'disabled'))
      .catch(() => setState('disabled'))
  }, [])

  async function enable() {
    setError('')
    setBusy(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'blocked' : 'disabled')
        return
      }
      const res = await fetch('/api/push/public-key')
      if (!res.ok) throw new Error('Could not fetch the push key.')
      const { publicKey } = await res.json()
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      })
      const saved = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      })
      if (!saved.ok) {
        await sub.unsubscribe().catch(() => undefined)
        throw new Error('Could not save the subscription.')
      }
      setState('enabled')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not enable notifications.')
    } finally {
      setBusy(false)
    }
  }

  async function disable() {
    setError('')
    setBusy(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        const endpoint = sub.endpoint
        await sub.unsubscribe()
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint }),
        })
      }
      setState('disabled')
    } catch {
      setError('Could not disable notifications.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-xl border border-border bg-panel p-5">
      <h2 className="font-semibold">Push notifications</h2>
      <p className="mt-0.5 text-sm text-muted">
        Get a notification on this device when a checklist is assigned to you or needs attention.
        On iPhone this only works after installing the app to the Home Screen (Share &rarr; Add to
        Home Screen).
      </p>
      <div className="mt-3 flex items-center gap-3">
        {state === 'loading' && <span className="text-sm text-faint">Checking…</span>}
        {state === 'unsupported' && (
          <span className="text-sm text-muted">
            This browser does not support push notifications.
          </span>
        )}
        {state === 'blocked' && (
          <span className="text-sm text-danger">
            Notifications are blocked — allow them in your browser settings, then reload.
          </span>
        )}
        {state === 'disabled' && (
          <button
            onClick={enable}
            disabled={busy}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-2 disabled:opacity-50"
          >
            {busy ? 'Enabling…' : 'Enable on this device'}
          </button>
        )}
        {state === 'enabled' && (
          <>
            <span className="text-sm text-ok">Enabled on this device.</span>
            <button
              onClick={disable}
              disabled={busy}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-hover disabled:opacity-50"
            >
              {busy ? 'Disabling…' : 'Disable'}
            </button>
          </>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </section>
  )
}
