-- CreateTable
CREATE TABLE "ChecklistShare" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "checklistId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChecklistShare_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "Checklist" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChecklistShare_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Checklist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT 'general',
    "status" TEXT NOT NULL DEFAULT 'active',
    "visibility" TEXT NOT NULL DEFAULT 'team',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "recurrence" TEXT NOT NULL DEFAULT 'none',
    "dueDate" DATETIME,
    "completedAt" DATETIME,
    "templateId" TEXT,
    "nextInstanceId" TEXT,
    "createdById" TEXT NOT NULL,
    "assignedToId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Checklist_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Checklist_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Checklist_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Checklist" ("assignedToId", "category", "completedAt", "createdAt", "createdById", "description", "dueDate", "id", "nextInstanceId", "priority", "recurrence", "status", "templateId", "title", "updatedAt") SELECT "assignedToId", "category", "completedAt", "createdAt", "createdById", "description", "dueDate", "id", "nextInstanceId", "priority", "recurrence", "status", "templateId", "title", "updatedAt" FROM "Checklist";
DROP TABLE "Checklist";
ALTER TABLE "new_Checklist" RENAME TO "Checklist";
CREATE UNIQUE INDEX "Checklist_nextInstanceId_key" ON "Checklist"("nextInstanceId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistShare_checklistId_userId_key" ON "ChecklistShare"("checklistId", "userId");
