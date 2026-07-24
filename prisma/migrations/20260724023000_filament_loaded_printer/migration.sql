-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_FilamentRoll" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "manufacturer" TEXT NOT NULL DEFAULT '',
    "material" TEXT NOT NULL DEFAULT 'PLA',
    "color" TEXT NOT NULL DEFAULT '',
    "startingGrams" REAL NOT NULL,
    "remainingGrams" REAL NOT NULL,
    "rollCount" INTEGER NOT NULL DEFAULT 1,
    "openedFromBag" BOOLEAN NOT NULL DEFAULT false,
    "lastDriedAt" DATETIME,
    "notes" TEXT NOT NULL DEFAULT '',
    "loadedPrinterId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FilamentRoll_loadedPrinterId_fkey" FOREIGN KEY ("loadedPrinterId") REFERENCES "Printer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_FilamentRoll" ("id", "name", "manufacturer", "material", "color", "startingGrams", "remainingGrams", "rollCount", "openedFromBag", "lastDriedAt", "notes", "createdAt", "updatedAt") SELECT "id", "name", "manufacturer", "material", "color", "startingGrams", "remainingGrams", "rollCount", "openedFromBag", "lastDriedAt", "notes", "createdAt", "updatedAt" FROM "FilamentRoll";
DROP TABLE "FilamentRoll";
ALTER TABLE "new_FilamentRoll" RENAME TO "FilamentRoll";
CREATE INDEX "FilamentRoll_loadedPrinterId_idx" ON "FilamentRoll"("loadedPrinterId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
