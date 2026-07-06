-- AlterTable
ALTER TABLE "Person" ADD COLUMN "birthday" TEXT;
ALTER TABLE "Person" ADD COLUMN "createdBy" TEXT;
ALTER TABLE "Person" ADD COLUMN "distrito" TEXT;
ALTER TABLE "Person" ADD COLUMN "email" TEXT;
ALTER TABLE "Person" ADD COLUMN "localidad" TEXT;
ALTER TABLE "Person" ADD COLUMN "municipio" TEXT;
ALTER TABLE "Person" ADD COLUMN "seccion" TEXT;
ALTER TABLE "Person" ADD COLUMN "zona" TEXT;

-- AlterTable
ALTER TABLE "Report" ADD COLUMN "assignedTo" TEXT;
ALTER TABLE "Report" ADD COLUMN "evidenceGallery" TEXT;

-- CreateTable
CREATE TABLE "ReportHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reportId" TEXT NOT NULL,
    "username" TEXT,
    "action" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReportHistory_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT,
    "role" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "detail" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Event" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "location" TEXT,
    "community" TEXT,
    "type" TEXT NOT NULL DEFAULT 'Reunión',
    "description" TEXT,
    "assignedTo" TEXT,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Event" ("createdAt", "createdBy", "date", "description", "id", "location", "title", "type", "updatedAt") SELECT "createdAt", "createdBy", "date", "description", "id", "location", "title", "type", "updatedAt" FROM "Event";
DROP TABLE "Event";
ALTER TABLE "new_Event" RENAME TO "Event";
CREATE TABLE "new_SystemConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "primaryColor" TEXT NOT NULL DEFAULT '#8B0000',
    "secondaryCol" TEXT NOT NULL DEFAULT '#FFFFFF',
    "accentColor" TEXT NOT NULL DEFAULT '#FFD700',
    "needTypes" TEXT NOT NULL DEFAULT '["Agua Potable", "Luz Eléctrica", "Drenaje", "Salud", "Educación", "Seguridad", "Otro"]',
    "eventTypes" TEXT NOT NULL DEFAULT '["Jornada de Captura", "Visita de Campo", "Reunión Vecinal", "Entrega de Apoyo"]',
    "customFields" TEXT NOT NULL DEFAULT '[]'
);
INSERT INTO "new_SystemConfig" ("accentColor", "customFields", "id", "needTypes", "primaryColor", "secondaryCol") SELECT "accentColor", "customFields", "id", "needTypes", "primaryColor", "secondaryCol" FROM "SystemConfig";
DROP TABLE "SystemConfig";
ALTER TABLE "new_SystemConfig" RENAME TO "SystemConfig";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ReportHistory_reportId_idx" ON "ReportHistory"("reportId");

-- CreateIndex
CREATE INDEX "AuditLog_entity_idx" ON "AuditLog"("entity");

-- CreateIndex
CREATE INDEX "AuditLog_username_idx" ON "AuditLog"("username");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "Person_seccion_idx" ON "Person"("seccion");

-- CreateIndex
CREATE INDEX "Person_municipio_idx" ON "Person"("municipio");

-- CreateIndex
CREATE INDEX "Person_localidad_idx" ON "Person"("localidad");

-- CreateIndex
CREATE INDEX "Person_createdBy_idx" ON "Person"("createdBy");

-- CreateIndex
CREATE INDEX "Report_status_idx" ON "Report"("status");

-- CreateIndex
CREATE INDEX "Report_needType_idx" ON "Report"("needType");

-- CreateIndex
CREATE INDEX "Report_municipio_idx" ON "Report"("municipio");

-- CreateIndex
CREATE INDEX "Report_timestamp_idx" ON "Report"("timestamp");

-- CreateIndex
CREATE INDEX "Report_user_idx" ON "Report"("user");

-- CreateIndex
CREATE INDEX "Report_assignedTo_idx" ON "Report"("assignedTo");

