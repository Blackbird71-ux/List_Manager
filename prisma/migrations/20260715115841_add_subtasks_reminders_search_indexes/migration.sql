-- AlterTable
ALTER TABLE "Checklist" ADD COLUMN "reminderOffsetHours" INTEGER;

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "checklistId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scheduledAt" DATETIME NOT NULL,
    "sent" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Reminder_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "Checklist" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Reminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "parentId" TEXT,
    "assignedToId" TEXT,
    "checkedByName" TEXT,
    "checkedAt" DATETIME,
    CONSTRAINT "ChecklistItem_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "Checklist" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChecklistItem_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ChecklistItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ChecklistItem_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ChecklistItem" ("assignedToId", "checked", "checkedAt", "checkedByName", "checklistId", "dueDate", "id", "notes", "priority", "sortOrder", "text") SELECT "assignedToId", "checked", "checkedAt", "checkedByName", "checklistId", "dueDate", "id", "notes", "priority", "sortOrder", "text" FROM "ChecklistItem";
DROP TABLE "ChecklistItem";
ALTER TABLE "new_ChecklistItem" RENAME TO "ChecklistItem";
CREATE INDEX "ChecklistItem_checklistId_idx" ON "ChecklistItem"("checklistId");
CREATE INDEX "ChecklistItem_assignedToId_idx" ON "ChecklistItem"("assignedToId");
CREATE INDEX "ChecklistItem_parentId_idx" ON "ChecklistItem"("parentId");
CREATE INDEX "ChecklistItem_text_idx" ON "ChecklistItem"("text");
CREATE INDEX "ChecklistItem_notes_idx" ON "ChecklistItem"("notes");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Reminder_scheduledAt_sent_idx" ON "Reminder"("scheduledAt", "sent");

-- CreateIndex
CREATE INDEX "Reminder_userId_sent_idx" ON "Reminder"("userId", "sent");

-- CreateIndex
CREATE INDEX "Checklist_dueDate_idx" ON "Checklist"("dueDate");

-- CreateIndex
CREATE INDEX "Checklist_status_dueDate_idx" ON "Checklist"("status", "dueDate");

-- CreateIndex
CREATE INDEX "Checklist_title_idx" ON "Checklist"("title");

-- CreateIndex
CREATE INDEX "Checklist_description_idx" ON "Checklist"("description");

-- CreateIndex
CREATE INDEX "Comment_body_idx" ON "Comment"("body");

-- CreateIndex
CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read");
