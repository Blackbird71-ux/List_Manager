-- AlterTable
ALTER TABLE "TemplateItem" ADD COLUMN "conditionIndex" INTEGER;
ALTER TABLE "TemplateItem" ADD COLUMN "conditionResult" TEXT NOT NULL DEFAULT '';
ALTER TABLE "TemplateItem" ADD COLUMN "dueOffsetDays" INTEGER;
ALTER TABLE "ChecklistItem" ADD COLUMN "conditionItemId" TEXT;
ALTER TABLE "ChecklistItem" ADD COLUMN "conditionResult" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ChecklistItem" ADD COLUMN "dueOffsetDays" INTEGER;
ALTER TABLE "Checklist" ADD COLUMN "escalatedAt" DATETIME;
