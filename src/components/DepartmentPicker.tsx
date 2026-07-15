'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import type { ApiDepartment } from '@/lib/types'

/**
 * Chip-style multi-select of the organisation's departments, used wherever a
 * checklist's "department" visibility is configured.
 */
export function DepartmentPicker({
  selected,
  onToggle,
  disabled,
}: {
  selected: Set<string>
  onToggle: (id: string) => void
  disabled?: boolean
}) {
  const [departments, setDepartments] = useState<ApiDepartment[] | null>(null)

  useEffect(() => {
    fetch('/api/departments').then(async (res) => {
      if (res.ok) setDepartments((await res.json()).departments)
    })
  }, [])

  if (departments === null) {
    return <p className="text-xs text-faint">Loading departments…</p>
  }
  if (departments.length === 0) {
    return (
      <p className="text-xs text-faint">
        No departments yet — an admin can add them under Users.
      </p>
    )
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {departments.map((d) => (
        <button
          key={d.id}
          type="button"
          onClick={() => onToggle(d.id)}
          disabled={disabled}
          className={cn(
            'rounded-full border px-2.5 py-1 text-xs font-medium',
            selected.has(d.id)
              ? 'border-accent bg-accent-soft text-accent'
              : 'border-border text-muted hover:bg-hover'
          )}
        >
          {d.name}
        </button>
      ))}
    </div>
  )
}
