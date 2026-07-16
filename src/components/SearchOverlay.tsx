'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import { X, ClipboardList, ListChecks, Search as SearchIcon } from 'lucide-react'

interface SearchResult {
  type: 'checklist' | 'item'
  id: string
  title: string
  snippet: string
  score: number
  checklistId?: string
  checklistTitle?: string
}

export function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus()
      setQuery('')
      setResults([])
      setSelectedIndex(-1)
    }
  }, [open])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (query.length < 2) {
      setResults([])
      return
    }
    setLoading(true)
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=20`)
        const data = await res.json()
        setResults(data.results ?? [])
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [query])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex((prev) => Math.max(prev - 1, 0))
        break
      case 'Enter':
        e.preventDefault()
        if (selectedIndex >= 0 && results[selectedIndex]) {
          const r = results[selectedIndex]
          if (r.type === 'item' && r.checklistId) {
            window.location.href = `/checklists/${r.checklistId}`
          } else {
            window.location.href = `/checklists/${r.id}`
          }
          onClose()
        }
        break
      case 'Escape':
        onClose()
        break
    }
  }, [selectedIndex, results, onClose])

  if (!open) return null

  const checklists = results.filter((r) => r.type === 'checklist')
  const items = results.filter((r) => r.type === 'item')

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4" onClick={onClose}>
      <div className="w-full max-w-2xl rounded-xl border border-border bg-panel p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <SearchIcon className="h-5 w-5 text-muted" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedIndex(-1)
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search checklists, items…"
            className="flex-1 bg-transparent text-lg outline-none placeholder:text-muted"
          />
          <button
            onClick={onClose}
            className="rounded px-2 py-1 text-xs text-muted hover:bg-hover"
          >
            Esc
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto py-3">
          {loading && (
            <div className="py-8 text-center text-sm text-muted">Searching…</div>
          )}

          {!loading && query.length >= 2 && results.length === 0 && (
            <div className="py-8 text-center text-sm text-muted">No results found.</div>
          )}

          {checklists.length > 0 && (
            <div className="mb-4">
              <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted uppercase tracking-wide">
                <ClipboardList className="h-3.5 w-3.5" /> Checklists
              </h3>
              {checklists.map((r, i) => (
                <Link
                  key={r.id}
                  href={`/checklists/${r.id}`}
                  className={`block rounded-lg px-3 py-2 transition ${
                    i === selectedIndex ? 'bg-accent/10' : 'hover:bg-hover'
                  }`}
                  onMouseEnter={() => setSelectedIndex(i)}
                  onClick={() => onClose()}
                >
                  <div className="font-medium text-ink">{r.title}</div>
                  {r.snippet && (
                    <div className="text-sm text-muted">{truncate(r.snippet, 80)}</div>
                  )}
                </Link>
              ))}
            </div>
          )}

          {items.length > 0 && (
            <div>
              <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold text-muted uppercase tracking-wide">
                <ListChecks className="h-3.5 w-3.5" /> Items
              </h3>
              {items.map((r, i) => {
                const globalIndex = checklists.length + i
                return (
                  <Link
                    key={r.id}
                    href={`/checklists/${r.checklistId}`}
                    className={`block rounded-lg px-3 py-2 transition ${
                      globalIndex === selectedIndex ? 'bg-accent/10' : 'hover:bg-hover'
                    }`}
                    onMouseEnter={() => setSelectedIndex(globalIndex)}
                    onClick={() => onClose()}
                  >
                    <div className="font-medium text-ink">{r.title}</div>
                    <div className="text-sm text-muted">
                      in <span className="font-medium text-ink">{r.checklistTitle}</span>
                      {r.snippet && ` — ${truncate(r.snippet, 60)}`}
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {query.length < 2 && (
          <div className="border-t border-border pt-3 text-center text-xs text-muted">
            Type at least 2 characters to search
          </div>
        )}
      </div>
    </div>
  )
}

function truncate(text: string, length: number): string {
  if (text.length <= length) return text
  return text.substring(0, length) + '…'
}
