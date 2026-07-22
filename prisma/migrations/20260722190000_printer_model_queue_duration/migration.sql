-- AlterTable
ALTER TABLE "Printer" ADD COLUMN "model" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "PrintQueueItem" ADD COLUMN "estimatedDurationSeconds" INTEGER;
