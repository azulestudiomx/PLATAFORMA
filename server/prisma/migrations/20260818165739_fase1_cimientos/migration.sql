-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "eleccion" TEXT NOT NULL DEFAULT '2027',
    "cargo" TEXT NOT NULL DEFAULT 'Presidente Municipal',
    "ambito" TEXT NOT NULL DEFAULT 'MUNICIPAL',
    "fechaInicio" TIMESTAMP(3),
    "fechaJornada" TIMESTAMP(3),
    "topeGastos" DECIMAL(14,2),
    "estado" TEXT NOT NULL DEFAULT 'ACTIVA',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Territory" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "listaNominal" INTEGER,
    "casillas" INTEGER,
    "tipoSeccion" TEXT,
    "distritoF" INTEGER,
    "distritoL" INTEGER,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "path" TEXT NOT NULL DEFAULT '',
    "depth" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Territory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'CAPTURISTA',
    "level" INTEGER NOT NULL DEFAULT 6,
    "campaignId" TEXT,
    "territoryId" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "photoUrl" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "passwordChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "jti" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedBy" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "thumbPath" TEXT,
    "mime" TEXT NOT NULL DEFAULT 'image/jpeg',
    "bytes" INTEGER NOT NULL DEFAULT 0,
    "sha256" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "ownerType" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consent" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "otorgado" BOOLEAN NOT NULL DEFAULT false,
    "medio" TEXT NOT NULL DEFAULT 'FISICO',
    "avisoVersion" TEXT NOT NULL DEFAULT '1.0',
    "firmaPath" TEXT,
    "finalidades" TEXT NOT NULL DEFAULT 'CONTACTO,GESTION',
    "ip" TEXT,
    "capturedBy" TEXT,
    "otorgadoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revocadoAt" TIMESTAMP(3),

    CONSTRAINT "Consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "municipio" TEXT,
    "localidad" TEXT,
    "distrito" TEXT,
    "zona" TEXT,
    "seccion" TEXT,
    "ineEnc" TEXT,
    "ineHash" TEXT,
    "ineLast4" TEXT,
    "birthday" TEXT,
    "genero" TEXT,
    "photoUrl" TEXT,
    "inePhotoUrl" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "campaignId" TEXT,
    "territoryId" TEXT,
    "synced" INTEGER NOT NULL DEFAULT 1,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "folio" TEXT,
    "municipio" TEXT,
    "comunidad" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "needType" TEXT,
    "description" TEXT,
    "evidenceUrl" TEXT,
    "evidenceGallery" TEXT,
    "timestamp" DOUBLE PRECISION,
    "user" TEXT,
    "status" TEXT NOT NULL DEFAULT 'Pendiente',
    "campaignId" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customData" TEXT,
    "response" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "sentiment" TEXT,
    "urgency" TEXT,
    "assignedTo" TEXT,
    "dueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportHistory" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "username" TEXT,
    "action" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "location" TEXT,
    "community" TEXT,
    "type" TEXT NOT NULL DEFAULT 'Reunión',
    "description" TEXT,
    "assignedTo" TEXT,
    "campaignId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "username" TEXT,
    "role" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "detail" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemConfig" (
    "id" TEXT NOT NULL,
    "primaryColor" TEXT NOT NULL DEFAULT '#8B0000',
    "secondaryCol" TEXT NOT NULL DEFAULT '#FFFFFF',
    "accentColor" TEXT NOT NULL DEFAULT '#FFD700',
    "needTypes" TEXT NOT NULL DEFAULT '["Agua Potable", "Luz Eléctrica", "Drenaje", "Salud", "Educación", "Seguridad", "Otro"]',
    "eventTypes" TEXT NOT NULL DEFAULT '["Jornada de Captura", "Visita de Campo", "Reunión Vecinal", "Entrega de Apoyo"]',
    "customFields" TEXT NOT NULL DEFAULT '[]',
    "avisoPrivacidad" TEXT NOT NULL DEFAULT '',
    "avisoVersion" TEXT NOT NULL DEFAULT '1.0',

    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_slug_key" ON "Campaign"("slug");

-- CreateIndex
CREATE INDEX "Campaign_estado_idx" ON "Campaign"("estado");

-- CreateIndex
CREATE INDEX "Territory_parentId_idx" ON "Territory"("parentId");

-- CreateIndex
CREATE INDEX "Territory_type_idx" ON "Territory"("type");

-- CreateIndex
CREATE INDEX "Territory_path_idx" ON "Territory"("path");

-- CreateIndex
CREATE UNIQUE INDEX "Territory_type_code_key" ON "Territory"("type", "code");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_campaignId_idx" ON "User"("campaignId");

-- CreateIndex
CREATE INDEX "User_territoryId_idx" ON "User"("territoryId");

-- CreateIndex
CREATE INDEX "User_active_idx" ON "User"("active");

-- CreateIndex
CREATE UNIQUE INDEX "Session_jti_key" ON "Session"("jti");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "MediaAsset_ownerType_ownerId_idx" ON "MediaAsset"("ownerType", "ownerId");

-- CreateIndex
CREATE INDEX "MediaAsset_sha256_idx" ON "MediaAsset"("sha256");

-- CreateIndex
CREATE INDEX "MediaAsset_kind_idx" ON "MediaAsset"("kind");

-- CreateIndex
CREATE INDEX "Consent_personId_idx" ON "Consent"("personId");

-- CreateIndex
CREATE INDEX "Consent_otorgado_idx" ON "Consent"("otorgado");

-- CreateIndex
CREATE UNIQUE INDEX "Person_ineHash_key" ON "Person"("ineHash");

-- CreateIndex
CREATE INDEX "Person_seccion_idx" ON "Person"("seccion");

-- CreateIndex
CREATE INDEX "Person_municipio_idx" ON "Person"("municipio");

-- CreateIndex
CREATE INDEX "Person_localidad_idx" ON "Person"("localidad");

-- CreateIndex
CREATE INDEX "Person_createdBy_idx" ON "Person"("createdBy");

-- CreateIndex
CREATE INDEX "Person_campaignId_idx" ON "Person"("campaignId");

-- CreateIndex
CREATE INDEX "Person_territoryId_idx" ON "Person"("territoryId");

-- CreateIndex
CREATE INDEX "Person_name_idx" ON "Person"("name");

-- CreateIndex
CREATE INDEX "Person_phone_idx" ON "Person"("phone");

-- CreateIndex
CREATE INDEX "Person_createdAt_idx" ON "Person"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Report_folio_key" ON "Report"("folio");

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

-- CreateIndex
CREATE INDEX "Report_campaignId_idx" ON "Report"("campaignId");

-- CreateIndex
CREATE INDEX "Report_createdAt_idx" ON "Report"("createdAt");

-- CreateIndex
CREATE INDEX "ReportHistory_reportId_idx" ON "ReportHistory"("reportId");

-- CreateIndex
CREATE INDEX "Event_date_idx" ON "Event"("date");

-- CreateIndex
CREATE INDEX "Event_campaignId_idx" ON "Event"("campaignId");

-- CreateIndex
CREATE INDEX "AuditLog_entity_idx" ON "AuditLog"("entity");

-- CreateIndex
CREATE INDEX "AuditLog_username_idx" ON "AuditLog"("username");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- AddForeignKey
ALTER TABLE "Territory" ADD CONSTRAINT "Territory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Territory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_territoryId_fkey" FOREIGN KEY ("territoryId") REFERENCES "Territory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_territoryId_fkey" FOREIGN KEY ("territoryId") REFERENCES "Territory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportHistory" ADD CONSTRAINT "ReportHistory_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
