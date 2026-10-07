ALTER TABLE "Template" ADD COLUMN "requiresSignOff" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Checklist" ADD COLUMN "requiresSignOff" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Checklist" ADD COLUMN "completedById" TEXT;
ALTER TABLE "Checklist" ADD COLUMN "signedOffById" TEXT;
ALTER TABLE "Checklist" ADD COLUMN "signedOffByName" TEXT;
ALTER TABLE "Checklist" ADD COLUMN "signedOffAt" DATETIME;
ALTER TABLE "Checklist" ADD COLUMN "signOffNote" TEXT NOT NULL DEFAULT '';
