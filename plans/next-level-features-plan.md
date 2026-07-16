# Lists Manager — Next-Level Features Implementation Plan

## Overview

This plan covers 5 new features:
1. **Full-Text Search** — Search across checklist titles, items, comments, and notes
2. **Subtasks** — Hierarchical checklist items with nested subtasks
3. **Scheduled Reminders** — Configurable reminders before due dates
4. **Bulk Operations** — Mass-update multiple checklists at once
5. **Analytics Dashboard** — Visual charts for team performance

---

## Feature 1: Full-Text Search

### Problem
Current search only matches checklist titles using a simple `contains` query. Users cannot find checklists by item text, comments, or notes.

### Solution
Implement a search API that queries across multiple fields and ranks results by relevance. Since SQLite doesn't have native full-text search that integrates well with Prisma, we'll use a hybrid approach: Prisma `OR` queries with `contains` on key text fields, combined with relevance scoring.

### Schema Changes
**None required** — we'll search existing fields:
- `Checklist.title`, `Checklist.description`
- `ChecklistItem.text`, `ChecklistItem.notes`
- `Comment.body`

### New API Route

**`GET /api/search?q=...&type=checklists|items|comments`**

```typescript
// src/app/api/search/route.ts
// Query params: q (required, min 2 chars), type (optional: checklists/items/comments/all), limit (default 50)
// Returns: { results: SearchResult[] }
// where SearchResult = { type: 'checklist' | 'item' | 'comment', id, title, snippet, score, checklistId?, checklistTitle? }
```

**Implementation approach:**
- Use Prisma `findMany` with `WHERE { OR: [...] }` containing `contains` filters on each searchable field
- For `Checklist`: search `title`, `description`
- For `ChecklistItem`: search `text`, `notes` (via `items.some`)
- For `Comment`: search `body` (via `comments.some`)
- Score results: title match = 10, description = 5, item text = 3, notes = 2, comment body = 1
- Order by a computed score (we can use a CASE statement or post-process in JS)
- Include `checklistAccessWhere` to enforce org/visibility permissions

### UI Changes

**`src/components/SearchOverlay.tsx`** — New component
- Triggered by `Ctrl+K` / `Cmd+K` keyboard shortcut or magnifying glass icon in header
- Modal overlay with search input
- Results grouped by type: Checklists, Items, Comments
- Each result shows title, snippet (highlighted match), and link
- Debounced input (300ms)
- Loading state with skeleton results

**Header update in [`AppShell.tsx`](src/components/AppShell.tsx:27)**
- Add search icon button that opens the overlay
- Show keyboard shortcut hint (`⌘K`)

### Database Indexes Needed
```prisma
// Add to Checklist model
@@index([title])
@@index([description])

// Add to ChecklistItem model
@@index([text])
@@index([notes])

// Add to Comment model
@@index([body])
```

### Edge Cases
- Empty or too-short queries (< 2 chars) → return empty results
- SQL injection → Prisma parameterizes all queries
- Performance → Limit results to 50, use indexes on searched fields
- Permission enforcement → Always apply `checklistAccessWhere`

---

## Feature 2: Subtasks (Nested Checklist Items)

### Problem
Checklist items are flat. Users cannot create hierarchical tasks (e.g., main task → sub-tasks).

### Solution
Add self-referencing relation to `ChecklistItem` for parent-child relationships. Subtasks inherit assignee and priority from parent by default but can be overridden.

### Schema Changes

**Modify `ChecklistItem` model:**
```prisma
model ChecklistItem {
  id          String    @id @default(cuid())
  checklistId String
  checklist   Checklist @relation(fields: [checklistId], references: [id], onDelete: Cascade)
  text        String
  checked     Boolean   @default(false)
  notes       String    @default("")
  priority    String?
  dueDate     DateTime?
  sortOrder   Int       @default(0)
  
  // Subtask fields (NEW)
  parentId    String?
  parent      ChecklistItem? @relation("SubtaskHierarchy", fields: [parentId], references: [id], onDelete: Cascade)
  subtasks    ChecklistItem[] @relation("SubtaskHierarchy")
  
  assignedToId String?
  assignedTo   User?   @relation("ItemAssignee", fields: [assignedToId], references: [id])
  checkedByName String?
  checkedAt    DateTime?

  attachments Attachment[]

  @@index([checklistId])
  @@index([assignedToId])
  @@index([parentId])
}
```

### API Changes

**Existing routes to modify:**

1. **`POST /api/checklists/[id]/items`** — Add optional `parentId` field to createSchema
2. **`PATCH /api/checklists/[id]/items/[itemId]`** — Add optional `parentId` to patchSchema
3. **`DELETE /api/checklists/[id]/items/[itemId]`** — Cascade delete subtasks when parent is deleted (handled by `onDelete: Cascade`)

**New API route:**

**`GET /api/checklists/[id]/items/tree`** — Returns items with nested subtasks
```typescript
// Response shape:
interface TreeItem {
  id: string
  text: string
  checked: boolean
  notes: string
  priority: string | null
  dueDate: string | null
  sortOrder: number
  assignedTo: ApiUserRef | null
  subtasks: TreeItem[]  // recursively nested
}
```

**Implementation:** Fetch flat items, then build tree in JavaScript using a Map for O(n) lookup.

### UI Changes

**Modify `ChecklistDetailClient.tsx`:**
- Add expand/collapse toggle for items with subtasks (chevron icon)
- Indent subtasks visually (margin-left with increasing depth)
- Show subtask count badge on parent items
- When checking parent, optionally check all subtasks (toggle in settings)
- Drag-and-drop reordering should respect hierarchy (cannot drag subtask outside parent's checklist)

**New component: `src/components/SubtaskInline.tsx`**
- Inline form for adding subtasks to an item
- Appears when clicking "Add subtask" button on an item

### Behavior Rules
- A parent is considered "complete" when all its subtasks are complete (but checking parent doesn't auto-check subtasks)
- Deleting a parent cascades to all subtasks
- Subtasks inherit parent's `assignedTo` and `priority` by default when created
- Subtasks can have their own independent due dates
- Reordering items preserves subtask hierarchy

---

## Feature 3: Scheduled Reminders

### Problem
Currently only overdue digests exist. Users cannot set proactive reminders (e.g., "Remind me 2 days before the checklist is due").

### Solution
Add a `Reminder` model that stores scheduled reminder times. A new scheduled job processes upcoming reminders and sends notifications.

### Schema Changes

**New model:**
```prisma
model Reminder {
  id          String   @id @default(cuid())
  checklistId String
  checklist   Checklist @relation(fields: [checklistId], references: [id], onDelete: Cascade)
  userId      String   // who should receive the reminder
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  scheduledAt DateTime // when to send the reminder
  sent        Boolean  @default(false)
  sentAt      DateTime?
  createdAt   DateTime @default(now())

  @@index([scheduledAt, sent])
  @@index([userId, sent])
}
```

**Modify `Checklist` model:**
Add optional reminder offset field:
```prisma
model Checklist {
  // ... existing fields ...
  
  // NEW: reminder offset in hours before dueDate (-24 = 1 day before, -48 = 2 days before, null = no reminder)
  reminderOffsetHours Int?
}
```

### API Changes

**New API routes:**

1. **`POST /api/checklists/[id]/reminders`** — Create a reminder for a checklist
```typescript
// Body: { userId: string, scheduledAt: string (ISO datetime) }
// Response: { reminder: Reminder }
```

2. **`DELETE /api/checklists/[id]/reminders/[reminderId]`** — Delete a reminder

3. **`GET /api/checklists/[id]/reminders`** — List reminders for a checklist

4. **`POST /api/scheduler/reminders`** — Cron-triggered job that processes due reminders (similar to existing `/api/scheduler/recurrence`)

**Modify checklist creation/update:**
- When a checklist is created/updated with a `reminderOffsetHours` value, create a `Reminder` record with `scheduledAt = dueDate - offsetHours`
- When the checklist's due date changes, update associated reminders

### Scheduler Implementation

**`src/lib/reminders.ts`** — New file
```typescript
export async function processUpcomingReminders(): Promise<{ processed: number; sent: number }> {
  const now = new Date()
  // Find unsent reminders due before now
  const dueReminders = await prisma.reminder.findMany({
    where: { sent: false, scheduledAt: { lte: now } },
    include: { checklist: { select: { title: true, dueDate: true } } }
  })
  
  let sent = 0
  for (const reminder of dueReminders) {
    await prisma.reminder.update({
      where: { id: reminder.id },
      data: { sent: true, sentAt: now }
    })
    await notify(reminder.userId, 'Upcoming reminder', 
      `"${reminder.checklist.title}" is due ${formatInTz(reminder.checklist.dueDate!, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.`,
      reminder.checklistId
    )
    sent++
  }
  
  return { processed: dueReminders.length, sent }
}
```

**Add to container cron** (modify `Dockerfile` entrypoint or crontab):
Run reminder processing every 15 minutes alongside the existing overdue digest.

### UI Changes

**Checklist detail page (`ChecklistDetailClient.tsx`):**
- Add "Reminders" section in checklist settings panel
- Dropdown to select reminder time: "None", "1 hour before", "4 hours before", "1 day before", "2 days before", "Custom..."
- Custom option opens a datetime picker
- Show list of active reminders with delete button

**Notifications:**
- Existing `notify()` function handles push + in-app notifications
- Reminders appear in the notifications bell alongside other alerts

---

## Feature 4: Bulk Operations

### Problem
Users must update checklists one at a time. No way to change assignee, priority, or due date for multiple checklists simultaneously.

### Solution
Add a bulk operations API that accepts an array of checklist IDs and an action to perform on all of them.

### API Changes

**New API route:**

**`POST /api/checklists/bulk`**
```typescript
// Body: {
//   ids: string[],           // checklist IDs (max 100)
//   action: 'assign' | 'priority' | 'dueDate' | 'complete' | 'delete',
//   data?: {                // depends on action
//     assignedToId?: string,
//     priority?: 'low' | 'medium' | 'high',
//     dueDate?: string,
//   }
// }
// Response: { success: number, failed: string[] }
```

**Implementation:**
```typescript
// src/app/api/checklists/bulk/route.ts
export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  
  const body = await request.json().catch(() => null)
  const parsed = bulkActionSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  
  const { ids, action, data } = parsed.data
  
  // Validate all checklists belong to user's org and user has access
  const accessibleChecklists = await prisma.checklist.findMany({
    where: {
      id: { in: ids },
      organizationId: session.user.organizationId,
      ...checklistAccessWhere(session.user.id, session.user.role, session.user.organizationId)
    },
    select: { id: true, assignedToId: true }
  })
  
  const accessibleIds = new Set(accessibleChecklists.map(c => c.id))
  const failed = ids.filter(id => !accessibleIds.has(id))
  
  let success = 0
  for (const id of accessibleChecklists.map(c => c.id)) {
    switch (action) {
      case 'assign':
        await prisma.checklist.update({ where: { id }, data: { assignedToId: data.assignedToId } })
        break
      case 'priority':
        await prisma.checklist.update({ where: { id }, data: { priority: data.priority } })
        break
      case 'dueDate':
        await prisma.checklist.update({ where: { id }, data: { dueDate: new Date(data.dueDate) } })
        break
      case 'complete':
        if (session.user.role === 'admin' || session.user.role === 'manager') {
          await prisma.checklist.update({ where: { id }, data: { status: 'completed', completedAt: new Date() } })
        }
        break
      case 'delete':
        if (await canManageChecklist(id, session.user.id, session.user.role, session.user.organizationId)) {
          await prisma.checklist.delete({ where: { id } })
        }
        break
    }
    success++
  }
  
  return NextResponse.json({ success, failed })
}
```

### UI Changes

**Dashboard (`DashboardClient.tsx`):**
- Add checkbox to each checklist row for selection
- When items are selected, show a floating action bar at the bottom with:
  - "Assign to..." dropdown
  - "Change priority" dropdown
  - "Set due date" picker
  - "Mark complete" (admin/manager only)
  - "Delete" (with confirmation dialog)
- "Select all visible" checkbox in header
- Show count: "5 of 23 selected"

**Confirmation dialogs:**
- Bulk delete: "Are you sure you want to delete X checklists? This cannot be undone."
- Bulk complete: "Mark X checklists as complete?"

**Permission checks:**
- Regular users can bulk assign, change priority, change due date
- Only admin/manager can bulk complete or bulk delete

---

## Feature 5: Analytics Dashboard

### Problem
The existing `/reports` page shows raw data tables but no visual charts. Users need quick visual insights into team performance and trends.

### Solution
Enhance the reports page with visual charts using Recharts (lightweight, React-native charting library). Add new analytics endpoints for chart data.

### New API Endpoints

**`GET /api/analytics/trend?days=90`**
```typescript
// Response: { daily: { date: string, completed: number, created: number }[] }
// Shows daily completion and creation counts for a line chart
```

**`GET /api/analytics/completion-time?days=90`**
```typescript
// Response: { byCategory: { category: string, avgHours: number, count: number }[], byUser: { name: string, avgHours: number, count: number }[] }
// Shows average completion time breakdowns
```

**`GET /api/analytics/overdue-trend?weeks=12`**
```typescript
// Response: { weekly: { weekStart: string, overdueCount: number }[] }
// Shows overdue trend over weeks
```

### UI Changes

**`src/components/AnalyticsDashboard.tsx`** — New component

Charts to implement:

1. **Completion Trend (Line Chart)**
   - X-axis: Date (daily over selected period)
   - Y-axis: Count
   - Two lines: Checklists Created, Checklists Completed
   
2. **Average Completion Time (Bar Chart)**
   - X-axis: Categories
   - Y-axis: Hours
   - Shows average time to complete per category
   
3. **Team Performance (Horizontal Bar Chart)**
   - X-axis: Number of items checked
   - Y-axis: User names
   - Top performers by activity
   
4. **Overdue Trend (Area Chart)**
   - X-axis: Weeks
   - Y-axis: Overdue count
   - Shows if overdue items are increasing or decreasing
   
5. **Completion Rate by Priority (Donut Chart)**
   - Segments: High, Medium, Low priority completion rates
   
6. **Weekly Heatmap (Calendar-like)**
   - Grid showing activity intensity by day/hour
   - Darker cells = more completions

**Charting library:** `recharts` — lightweight, React-focused, no heavy dependencies

### Dependencies to Add
```json
{
  "dependencies": {
    "recharts": "^2.15.0"
  }
}
```

### Integration with Existing Reports Page
- Add a "Charts" tab alongside the existing data tables in `/reports`
- Keep the existing table view as it provides detailed data
- Charts provide quick visual overview
- Allow date range selector to apply to all charts

---

## File Change Summary

### New Files
| File | Purpose |
|------|---------|
| `src/components/SearchOverlay.tsx` | Modal search UI with keyboard shortcut |
| `src/components/SubtaskInline.tsx` | Inline subtask creation form |
| `src/components/AnalyticsDashboard.tsx` | Chart-based analytics views |
| `src/lib/search.ts` | Search query builder and relevance scoring |
| `src/lib/reminders.ts` | Reminder processing scheduler |
| `src/app/api/search/route.ts` | Search API endpoint |
| `src/app/api/checklists/bulk/route.ts` | Bulk operations API |
| `src/app/api/checklists/[id]/reminders/route.ts` | Reminder CRUD for checklist |
| `src/app/api/checklists/[id]/items/tree/route.ts` | Tree-structured items API |
| `src/app/api/scheduler/reminders/route.ts` | Cron job for processing reminders |
| `src/app/api/analytics/trend/route.ts` | Trend data API |
| `src/app/api/analytics/completion-time/route.ts` | Completion time API |
| `src/app/api/analytics/overdue-trend/route.ts` | Overdue trend API |

### Modified Files
| File | Changes |
|------|---------|
| `prisma/schema.prisma` | Add `parentId`, `parent`, `subtasks` to ChecklistItem; add `reminderOffsetHours` to Checklist; add new `Reminder` model; add indexes |
| `src/components/AppShell.tsx` | Add search trigger button to header |
| `src/components/ChecklistDetailClient.tsx` | Add subtask rendering, expand/collapse, reminder settings |
| `src/components/DashboardClient.tsx` | Add checkboxes, bulk action bar, selection state |
| `src/lib/checklist-helpers.ts` | Add tree-building helper, reminder creation on checklist update |
| `src/lib/notifications.ts` | Already supports checklistId — no changes needed |
| `Dockerfile` | Add reminder processing cron job |
| `package.json` | Add `recharts` dependency |

---

## Implementation Order

Recommended order to minimize dependencies and maximize early wins:

1. **Bulk Operations** — Simplest to implement, no schema changes needed beyond new API route
2. **Full-Text Search** — No schema changes, just API route + UI component
3. **Scheduled Reminders** — Requires schema changes but isolated from other features
4. **Subtasks** — Requires schema changes and affects checklist item rendering
5. **Analytics Dashboard** — Depends on existing reports API, mostly UI work

---

## Migration Strategy

All schema changes use Prisma migrations:
```bash
npx prisma migrate dev --name add_subtasks
npx prisma migrate dev --name add_reminders
npx prisma migrate dev --name add_indexes
```

For the subtask feature, existing items will have `parentId: null` automatically.
For reminders, existing checklists won't have reminders until the user sets one.

---

## Testing Strategy

### Unit Tests
- `src/lib/__tests__/search.test.ts` — Relevance scoring, permission filtering
- `src/lib/__tests__/reminders.test.ts` — Reminder scheduling, processing
- `src/lib/__tests__/tree.test.ts` — Flat-to-tree conversion

### Integration Tests
- Bulk operation API with permission checks
- Subtask cascade delete behavior
- Reminder notification delivery

### UI Tests (future)
- Search overlay keyboard shortcuts
- Subtask expand/collapse interactions
- Bulk selection and action flow
