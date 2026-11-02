-- AlterTable
ALTER TABLE "User" ADD COLUMN "calendarTokenHash" TEXT;
ALTER TABLE "User" ADD COLUMN "calendarTokenCreatedAt" DATETIME;

-- CreateIndex
CREATE UNIQUE INDEX "User_calendarTokenHash_key" ON "User"("calendarTokenHash");
