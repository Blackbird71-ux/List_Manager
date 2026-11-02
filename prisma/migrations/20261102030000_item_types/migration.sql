-- Answer types: number (with unit and pass range), text, signature; optional photo requirement.
ALTER TABLE "TemplateItem" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'check';
ALTER TABLE "TemplateItem" ADD COLUMN "unit" TEXT NOT NULL DEFAULT '';
ALTER TABLE "TemplateItem" ADD COLUMN "minValue" REAL;
ALTER TABLE "TemplateItem" ADD COLUMN "maxValue" REAL;
ALTER TABLE "TemplateItem" ADD COLUMN "photoRequired" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ChecklistItem" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'check';
ALTER TABLE "ChecklistItem" ADD COLUMN "value" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ChecklistItem" ADD COLUMN "unit" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ChecklistItem" ADD COLUMN "minValue" REAL;
ALTER TABLE "ChecklistItem" ADD COLUMN "maxValue" REAL;
ALTER TABLE "ChecklistItem" ADD COLUMN "photoRequired" BOOLEAN NOT NULL DEFAULT false;
