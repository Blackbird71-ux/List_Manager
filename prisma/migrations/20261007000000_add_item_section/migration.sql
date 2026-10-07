-- AlterTable
ALTER TABLE "TemplateItem" ADD COLUMN "section" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "ChecklistItem" ADD COLUMN "section" TEXT NOT NULL DEFAULT '';
