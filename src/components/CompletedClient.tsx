'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, ChevronLeft, ChevronRight, Lock, Search } from 'lucide-react'
import type { ApiChecklist } from '@/lib/types'
import { cn } from '@/lib/utils'

export function CompletedClient() {
  const [checklists, setChecklists] = useState<ApiChecklist[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('') // debounced value sent to the API
  const [categoryFilter, setCategoryFilter] = useState('')
  const [categories, setCategories] = useState<string[]>([])

  // Debounce the search box so we don't hit the API per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const params = new URLSearchParams({ status: 'completed', page: String(page) })
        if (query) params.set('q', query)
        if (categoryFilter) params.set('category', categoryFilter)
        const res = await fetch(`/api/checklists?${params}`)
        if (!res.ok || cancelled) return
        const data = await res.json()
        if (cancelled) return
        setChecklists(data.checklists)
        setTotal(data.total)
        setPageSize(data.pageSize)
        // Collect categories from what we've seen so the filter stays useful.
        setCategories((prev) =>
          Array.from(
            new Set([...prev, ...data.checklists.map((c: ApiChecklist) => c.category)])
          ).sort()
        )
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [page, query, categoryFilter])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1
  const rangeEnd = Math.min(page * pageSize, total)

  const grouped = useMemo(() => {
    const groups = new Map<string, ApiChecklist[]>()
    for (const c of checklists) {
      const key = c.completedAt
        ? new Date(c.completedAt).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'long',
          })
        : 'Unknown'
      const list = groups.get(key) ?? []
      list.push(c)
      groups.set(key, list)
    }
    return Array.from(groups.entries())
  }, [checklists])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-semibold">Completed checklists</h1>
        <span className="text-sm text-faint">{total} total</span>

        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-faint" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title…"
            className="rounded-lg border border-border bg-field py-2 pl-8 pr-3 text-sm focus:border-accent focus:outline-none"
          />
        </div>

        <select
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value)
            setPage(1)
          }}
          className="rounded-lg border border-border bg-field px-2 py-2 text-sm"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="py-12 text-center text-sm text-faint">Loading…</p>
      ) : checklists.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-16 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-faint" />
          <p className="mt-2 text-sm text-faint">
            {query || categoryFilter ? 'Nothing matches your filters.' : 'Nothing completed yet.'}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map(([month, lists]) => (
            <div key={month}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
                {month}
              </h2>
              <div className="overflow-hidden rounded-xl border border-border bg-panel">
                {lists.map((c, idx) => {
                  const done = c.items.filter((i) => i.checked).length
                  return (
                    <Link
                      key={c.id}
                      href={`/checklists/${c.id}`}
                      className={cn(
                        'flex items-center gap-3 px-4 py-3 hover:bg-hover',
                        idx > 0 && 'border-t border-border-soft'
                      )}
                    >
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-ok" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{c.title}</p>
                        <p className="text-xs text-faint">
                          {c.category} · {done}/{c.items.length} items
                          {c.assignedTo ? ` · ${c.assignedTo.name}` : ''}
                        </p>
                      </div>
                      {c.visibility === 'private' && (
                        <Lock className="h-3.5 w-3.5 shrink-0 text-faint" />
                      )}
                      <span className="shrink-0 text-xs text-muted">
                        {c.completedAt ? new Date(c.completedAt).toLocaleDateString() : ''}
                      </span>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {total > pageSize && (
        <div className="flex items-center justify-between text-sm text-muted">
          <span>
            {rangeStart}–{rangeEnd} of {total}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-lg border border-border p-1.5 hover:bg-hover disabled:opacity-40"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded-lg border border-border p-1.5 hover:bg-hover disabled:opacity-40"
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
