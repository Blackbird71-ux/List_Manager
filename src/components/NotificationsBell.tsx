'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell } from 'lucide-react'
import type { ApiNotification } from '@/lib/types'
import { cn } from '@/lib/utils'

export function NotificationsBell() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<ApiNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const panelRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications')
      if (!res.ok) return
      const data = await res.json()
      setNotifications(data.notifications)
      setUnreadCount(data.unreadCount)
    } catch {
      // network hiccup — keep whatever we have
    }
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(load, 60_000)
    return () => clearInterval(interval)
  }, [load])

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  async function markAllRead() {
    await fetch('/api/notifications', { method: 'PATCH' })
    load()
  }

  async function openNotification(n: ApiNotification) {
    if (!n.read) {
      await fetch(`/api/notifications/${n.id}`, { method: 'PATCH' })
      load()
    }
    if (n.checklistId) {
      setOpen(false)
      router.push(`/checklists/${n.checklistId}`)
    }
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-lg p-2 text-muted hover:bg-hover"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-xl border border-border bg-panel shadow-lg">
          <div className="flex items-center justify-between border-b border-border-soft px-4 py-2.5">
            <span className="text-sm font-semibold">Notifications</span>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs text-accent hover:underline">
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-faint">No notifications</p>
            )}
            {notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => openNotification(n)}
                className={cn(
                  'block w-full border-b border-border-soft px-4 py-3 text-left hover:bg-hover',
                  !n.read && 'bg-accent-soft'
                )}
              >
                <p className="text-sm font-medium text-ink">{n.title}</p>
                <p className="mt-0.5 text-xs text-muted">{n.body}</p>
                <p className="mt-1 text-[11px] text-faint">
                  {new Date(n.createdAt).toLocaleString()}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
