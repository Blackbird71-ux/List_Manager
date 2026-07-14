'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, Circle, ExternalLink, Loader2, RefreshCw } from 'lucide-react'

interface TunnelStatus {
  loggedIn: boolean
  tunnelCreated: boolean
  configured: boolean
  tunnelId: string | null
  // Runtime health (present when the server is running in Docker)
  inContainer?: boolean
  running?: boolean
  readyConnections?: number | null
  processAlive?: boolean
  originReachable?: boolean
  uptime?: string | null
}

function LiveHealthBadge({ status }: { status: TunnelStatus }) {
  // Only meaningful in the container; local dev has no tunnel process.
  if (!status.inContainer) {
    return (
      <div className="flex items-start gap-2 rounded-lg bg-hover p-3 text-sm text-muted">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>Running in local dev — tunnel controls only work inside the Docker container on the NAS.</span>
      </div>
    )
  }

  if (status.running) {
    const conns = status.readyConnections ?? 0
    return (
      <div className="flex items-start gap-2 rounded-lg bg-ok-soft p-3 text-sm text-ok">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Tunnel connected — {conns} edge connection{conns === 1 ? '' : 's'} ready
          {status.uptime ? ` · up ${status.uptime}` : ''}.
          {!status.originReachable && ' (Warning: origin localhost:3000 not responding.)'}
        </span>
      </div>
    )
  }

  if (status.processAlive) {
    return (
      <div className="flex items-start gap-2 rounded-lg bg-warn-soft p-3 text-sm text-warn">
        <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
        <span>cloudflared is running but not yet connected to Cloudflare. Reconnecting…</span>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-2 rounded-lg bg-danger-soft p-3 text-sm text-danger">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>Tunnel not running. The supervisor restarts it automatically every ~5s — or use Restart below.</span>
    </div>
  )
}

function StepIcon({ done, active }: { done: boolean; active?: boolean }) {
  if (done) return <CheckCircle2 className="h-5 w-5 shrink-0 text-ok" />
  if (active) return <Loader2 className="h-5 w-5 shrink-0 animate-spin text-accent" />
  return <Circle className="h-5 w-5 shrink-0 text-faint" />
}

const inputClass =
  'w-full rounded-lg border border-border bg-field px-3 py-2 text-sm focus:border-accent focus:outline-none'
const buttonClass =
  'rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-accent-2 disabled:opacity-50'

export function TunnelSection() {
  const [status, setStatus] = useState<TunnelStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Step 1 — login
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginUrl, setLoginUrl] = useState<string | null>(null)
  const [loginPolling, setLoginPolling] = useState(false)

  // Step 2 — create
  const [createLoading, setCreateLoading] = useState(false)

  // Step 3 — configure
  const [configLoading, setConfigLoading] = useState(false)
  const [tunnelIdInput, setTunnelIdInput] = useState('')
  const [hostname, setHostname] = useState('lists.liddleapps.com')

  // Step 4 — restart
  const [restartLoading, setRestartLoading] = useState(false)
  const [restartDone, setRestartDone] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/tunnel/status')
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error ?? 'Failed to load tunnel status')
        return null
      }
      const data: TunnelStatus = await res.json()
      setStatus(data)
      setTunnelIdInput((prev) => prev || data.tunnelId || '')
      return data
    } catch {
      setError('Network error loading tunnel status')
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  function pollForLogin() {
    const interval = setInterval(async () => {
      const s = await fetchStatus()
      if (s?.loggedIn) {
        clearInterval(interval)
        setLoginPolling(false)
        setLoginUrl(null)
      }
    }, 3000)
    // Stop polling after 5 minutes
    setTimeout(() => {
      clearInterval(interval)
      setLoginPolling(false)
    }, 300000)
  }

  async function handleLogin() {
    setLoginLoading(true)
    setLoginUrl(null)
    setError(null)
    try {
      const res = await fetch('/api/tunnel/login', { method: 'POST' })
      const data = await res.json().catch(() => null)
      if (!res.ok) { setError(data?.error ?? 'Something went wrong'); return }
      setLoginUrl(data.url)
      setLoginPolling(true)
      pollForLogin()
    } catch {
      setError('Network error')
    } finally {
      setLoginLoading(false)
    }
  }

  async function handleCreate() {
    setCreateLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/tunnel/create', { method: 'POST' })
      const data = await res.json().catch(() => null)
      if (!res.ok) { setError(data?.error ?? 'Something went wrong'); return }
      setTunnelIdInput(data.tunnelId)
      await fetchStatus()
    } catch {
      setError('Network error')
    } finally {
      setCreateLoading(false)
    }
  }

  async function handleConfigure() {
    setConfigLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/tunnel/configure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tunnelId: tunnelIdInput.trim(), hostname }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) { setError(data?.error ?? 'Something went wrong'); return }
      await fetchStatus()
    } catch {
      setError('Network error')
    } finally {
      setConfigLoading(false)
    }
  }

  async function handleRestart() {
    setRestartLoading(true)
    setRestartDone(false)
    setError(null)
    try {
      const res = await fetch('/api/tunnel/restart', { method: 'POST' })
      const data = await res.json().catch(() => null)
      if (!res.ok) { setError(data?.error ?? 'Something went wrong'); return }
      setRestartDone(true)
      await fetchStatus()
    } catch {
      setError('Network error')
    } finally {
      setRestartLoading(false)
    }
  }

  if (loading) {
    return (
      <section className="rounded-xl border border-border bg-panel p-5">
        <h2 className="font-semibold">Cloudflare Tunnel</h2>
        <div className="mt-3 flex items-center gap-2 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading tunnel status…
        </div>
      </section>
    )
  }

  const loggedIn = status?.loggedIn ?? false
  const tunnelCreated = status?.tunnelCreated ?? false
  const configured = status?.configured ?? false
  // The tunnel is running if the server reports a live connection, or we just
  // restarted it this session.
  const isRunning = restartDone || (status?.running ?? false)

  return (
    <section className="rounded-xl border border-border bg-panel p-5">
      <h2 className="font-semibold">Cloudflare Tunnel</h2>
      <p className="mt-0.5 text-sm text-muted">
        Zero Trust access so Lists Manager is reachable at lists.liddleapps.com.
        cloudflared is bundled in the container — no external install needed.
      </p>

      <div className="mt-4 space-y-5">
        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-danger-soft p-3 text-sm text-danger">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {status && <LiveHealthBadge status={status} />}

        {/* Step 1 — Authenticate */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <StepIcon done={loggedIn} active={loginPolling} />
            <span className="text-sm font-medium">Step 1: Authenticate with Cloudflare</span>
          </div>
          {!loggedIn && (
            <div className="ml-8 space-y-3">
              <button type="button" onClick={handleLogin} disabled={loginLoading || loginPolling} className={buttonClass}>
                {loginLoading ? 'Contacting Cloudflare…' : 'Connect to Cloudflare'}
              </button>
              {loginUrl && (
                <div className="space-y-2">
                  <p className="text-sm text-muted">Open this URL in your browser to log in:</p>
                  <a
                    href={loginUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 break-all text-sm text-accent underline"
                  >
                    {loginUrl}
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                  {loginPolling && (
                    <div className="flex items-center gap-2 text-sm text-muted">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Waiting for authentication…
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Step 2 — Create tunnel */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <StepIcon done={tunnelCreated} />
            <span className={`text-sm font-medium ${!loggedIn ? 'text-muted' : ''}`}>Step 2: Create Tunnel</span>
          </div>
          {loggedIn && !tunnelCreated && (
            <div className="ml-8">
              <button type="button" onClick={handleCreate} disabled={createLoading} className={buttonClass}>
                {createLoading ? 'Creating…' : 'Create Tunnel'}
              </button>
            </div>
          )}
        </div>

        {/* Step 3 — Configure */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <StepIcon done={configured} />
            <span className={`text-sm font-medium ${!loggedIn ? 'text-muted' : ''}`}>Step 3: Save Configuration</span>
          </div>
          {loggedIn && !configured && (
            <div className="ml-8 space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium">Tunnel ID</label>
                <input
                  value={tunnelIdInput}
                  onChange={(e) => setTunnelIdInput(e.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className={`${inputClass} font-mono`}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">Hostname</label>
                <input
                  value={hostname}
                  onChange={(e) => setHostname(e.target.value)}
                  placeholder="lists.liddleapps.com"
                  className={inputClass}
                />
              </div>
              <button type="button" onClick={handleConfigure} disabled={configLoading || !tunnelIdInput} className={buttonClass}>
                {configLoading ? 'Saving…' : 'Save Config'}
              </button>
              <p className="text-xs text-faint">
                After saving, add a Cloudflare DNS CNAME for <strong>{hostname}</strong> pointing to{' '}
                <code className="font-mono">{tunnelIdInput || '<tunnel-id>'}.cfargotunnel.com</code>
              </p>
            </div>
          )}
        </div>

        {/* Step 4 — Start / restart tunnel */}
        {configured && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <StepIcon done={isRunning} />
              <span className="text-sm font-medium">{isRunning ? 'Tunnel Active' : 'Start Tunnel'}</span>
            </div>
            <div className="ml-8 flex items-center gap-3">
              <button type="button" onClick={handleRestart} disabled={restartLoading} className={buttonClass}>
                {restartLoading ? 'Starting…' : isRunning ? 'Restart Tunnel' : 'Start Tunnel'}
              </button>
              {isRunning && <span className="text-sm text-ok">Tunnel running</span>}
            </div>
            {status?.tunnelId && (
              <p className="ml-8 text-xs text-faint">
                Tunnel ID: <code className="font-mono">{status.tunnelId}</code>
              </p>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => fetchStatus()}
          className="flex items-center gap-1 text-xs text-muted hover:text-ink"
        >
          <RefreshCw className="h-3 w-3" />
          Refresh status
        </button>
      </div>
    </section>
  )
}
