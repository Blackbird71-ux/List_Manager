'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import {
  CheckCircle2,
  ClipboardList,
  LayoutTemplate,
  ListChecks,
  LogOut,
  Settings,
  Users,
} from 'lucide-react'
import { NotificationsBell } from '@/components/NotificationsBell'
import { cn } from '@/lib/utils'

interface AppShellProps {
  user: { name: string; role: string }
  children: React.ReactNode
}

export function AppShell({ user, children }: AppShellProps) {
  const pathname = usePathname()

  const links = [
    { href: '/', label: 'Checklists', icon: ListChecks },
    { href: '/completed', label: 'Completed', icon: CheckCircle2 },
    { href: '/templates', label: 'Templates', icon: LayoutTemplate },
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
    </div>
  )
}
