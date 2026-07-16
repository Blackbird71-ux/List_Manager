'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import {
  BarChart3,
  CheckCircle2,
  ClipboardList,
  LayoutTemplate,
  ListChecks,
  LogOut,
  Search as SearchIcon,
  Settings,
  UserCheck,
  Users,
  Users2,
} from 'lucide-react'
import { HelpMenu } from '@/components/HelpMenu'
import { NotificationsBell } from '@/components/NotificationsBell'
import { SearchOverlay } from '@/components/SearchOverlay'
import { cn } from '@/lib/utils'
import { useState, useEffect } from 'react'

interface AppShellProps {
  user: { name: string; role: string }
  children: React.ReactNode
}

export function AppShell({ user, children }: AppShellProps) {
  const pathname = usePathname()
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen((prev) => !prev)
      }
      if (e.key === 'Escape' && searchOpen) {
        setSearchOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [searchOpen])

  const links = [
    { href: '/', label: 'Checklists', icon: ListChecks },
    { href: '/my-work', label: 'My Work', icon: UserCheck },
    { href: '/my-team', label: 'My Team', icon: Users2 },
    { href: '/completed', label: 'Completed', icon: CheckCircle2 },
    { href: '/templates', label: 'Templates', icon: LayoutTemplate },
    ...(user.role === 'admin' || user.role === 'manager'
      ? [{ href: '/reports', label: 'Reports', icon: BarChart3 }]
      : []),
    ...(user.role === 'admin' ? [{ href: '/admin/users', label: 'Users', icon: Users }] : []),
  ]

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border bg-panel/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold text-ink">
            <ClipboardList className="h-5 w-5 text-accent" />
            Lists Manager
          </Link>

          <nav className="ml-4 flex items-center gap-1">
            {links.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium',
                  (href === '/' ? pathname === '/' : pathname.startsWith(href))
                    ? 'bg-accent-soft text-accent'
                    : 'text-muted hover:bg-hover'
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-2 rounded-lg border border-border bg-field px-3 py-1.5 text-sm text-muted hover:border-accent"
              title="Search (⌘K)"
            >
              <SearchIcon className="h-4 w-4" />
              <span className="hidden sm:inline">Search…</span>
              <kbd className="hidden ml-1 rounded border border-border bg-hover px-1.5 py-0.5 text-[10px] font-medium sm:inline">⌘K</kbd>
            </button>
            <HelpMenu />
            <NotificationsBell />
            <Link
              href="/settings"
              className={cn(
                'rounded-lg p-2',
                pathname.startsWith('/settings')
                  ? 'bg-accent-soft text-accent'
                  : 'text-muted hover:bg-hover'
              )}
              aria-label="Settings"
              title="Settings"
            >
              <Settings className="h-4 w-4" />
            </Link>
            <span className="hidden text-sm text-muted sm:inline">{user.name}</span>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="rounded-lg p-2 text-muted hover:bg-hover"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>

      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  )
}
