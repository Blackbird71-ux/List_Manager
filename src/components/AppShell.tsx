'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { ClipboardList, LayoutTemplate, ListChecks, LogOut, Users } from 'lucide-react'
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
    { href: '/templates', label: 'Templates', icon: LayoutTemplate },
    ...(user.role === 'admin' ? [{ href: '/admin/users', label: 'Users', icon: Users }] : []),
  ]

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold text-slate-900">
            <ClipboardList className="h-5 w-5 text-blue-600" />
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
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-600 hover:bg-slate-100'
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <NotificationsBell />
            <span className="hidden text-sm text-slate-500 sm:inline">{user.name}</span>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
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
