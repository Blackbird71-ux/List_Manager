// API response shapes shared by the client components.

export interface ApiUser {
  id: string
  name: string
  email: string
  role: string
  createdAt?: string
  departments?: { department: { id: string; name: string } }[]
}

export interface ApiDepartment {
  id: string
  name: string
  members: { user: { id: string; name: string } }[]
}

export interface ApiUserRef {
  id: string
  name: string
  email: string
}

export interface ApiTemplateItem {
  id: string
  text: string
  priority: string | null
  sortOrder: number
}

export interface ApiCustomFieldDef {
  id: string
  name: string
  type: string // "text" | "dropdown" | "user"
  options: string // JSON array of strings
  required: boolean
  sortOrder: number
}

export interface ApiTemplate {
  id: string
  title: string
  description: string
  category: string
  recurrence: string
  archived: boolean
  createdAt: string
  updatedAt: string
  items: ApiTemplateItem[]
  customFields: ApiCustomFieldDef[]
  createdBy: { id: string; name: string }
  _count: { checklists: number }
}

export interface ApiAttachment {
  id: string
  fileName: string
  mimeType: string
  size: number
  createdAt: string
}

export interface ApiChecklistItem {
  id: string
  text: string
  checked: boolean
  notes: string
  priority: string | null
  sortOrder: number
  assignedTo: ApiUserRef | null
  checkedByName: string | null
  checkedAt: string | null
  attachments: ApiAttachment[]
}

export interface ApiCustomFieldValue {
  id: string
  name: string
  type: string
  value: string
}

export interface ApiChecklist {
  id: string
  title: string
  description: string
  category: string
  status: string
  priority: string
  recurrence: string
  dueDate: string | null
  completedAt: string | null
  nextInstanceId: string | null
  visibility: string // "team" | "department" | "private"
  createdAt: string
  items: ApiChecklistItem[]
  fieldValues: ApiCustomFieldValue[]
  assignedTo: ApiUserRef | null
  createdBy: ApiUserRef
  template: { id: string; title: string } | null
  templateVersion: number | null
  shares: { user: ApiUserRef }[]
  departments?: { department: { id: string; name: string } }[]
}

export interface ApiComment {
  id: string
  body: string
  createdAt: string
  author: { id: string; name: string }
}

export interface ApiActivity {
  id: string
  actorName: string
  action: string
  detail: string
  createdAt: string
}

export interface ApiNotification {
  id: string
  title: string
  body: string
  read: boolean
  checklistId: string | null
  createdAt: string
}
