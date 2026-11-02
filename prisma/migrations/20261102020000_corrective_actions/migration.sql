-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ChecklistItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "checklistId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT NOT NULL DEFAULT '',
    "priority" TEXT,
    "dueDate" DATETIME,
    "section" TEXT NOT NULL DEFAULT '',
    "indent" INTEGER NOT NULL DEFAULT 0,
    "result" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "parentId" TEXT,
    "assignedToId" TEXT,
    "checkedByName" TEXT,
    "checkedAt" DATETIME,
    "conditionItemId" TEXT,
    "conditionResult" TEXT NOT NULL DEFAULT '',
    "dueOffsetDays" INTEGER,
    "actionText" TEXT NOT NULL DEFAULT '',
    "actionAssignedToId" TEXT,
    "actionDueDate" DATETIME,
    "actionClosedAt" DATETIME,
    "actionClosedByName" TEXT,
    "actionCloseNote" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "ChecklistItem_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "Checklist" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChecklistItem_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ChecklistItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChecklistItem_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ChecklistItem_actionAssignedToId_fkey" FOREIGN KEY ("actionAssignedToId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ChecklistItem" ("assignedToId", "checked", "checkedAt", "checkedByName", "checklistId", "conditionItemId", "conditionResult", "dueDate", "dueOffsetDays", "id", "indent", "notes", "parentId", "priority", "result", "section", "sortOrder", "text") SELECT "assignedToId", "checked", "checkedAt", "checkedByName", "checklistId", "conditionItemId", "conditionResult", "dueDate", "dueOffsetDays", "id", "indent", "notes", "parentId", "priority", "result", "section", "sortOrder", "text" FROM "ChecklistItem";
DROP TABLE "ChecklistItem";
ALTER TABLE "new_ChecklistItem" RENAME TO "ChecklistItem";
CREATE INDEX "ChecklistItem_checklistId_idx" ON "ChecklistItem"("checklistId");
CREATE INDEX "ChecklistItem_assignedToId_idx" ON "ChecklistItem"("assignedToId");
CREATE INDEX "ChecklistItem_parentId_idx" ON "ChecklistItem"("parentId");
CREATE INDEX "ChecklistItem_actionAssignedToId_idx" ON "ChecklistItem"("actionAssignedToId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

