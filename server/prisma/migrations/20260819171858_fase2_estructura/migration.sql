-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "adultoMayor" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "afinidad" TEXT NOT NULL DEFAULT 'NO_CONTACTADO',
ADD COLUMN     "compromisoAt" TIMESTAMP(3),
ADD COLUMN     "compromisoPor" TEXT,
ADD COLUMN     "compromisoVoto" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "esLider" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "multiplicador" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "notas" TEXT,
ADD COLUMN     "origen" TEXT NOT NULL DEFAULT 'BRIGADA',
ADD COLUMN     "primeraVotacion" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "promotorId" TEXT,
ADD COLUMN     "requiereTransporte" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "verificado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "verificadoAt" TIMESTAMP(3),
ADD COLUMN     "verificadoPor" TEXT;

-- CreateTable
CREATE TABLE "StructureNode" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT,
    "email" TEXT,
    "userId" TEXT,
    "rol" TEXT NOT NULL,
    "nivel" INTEGER NOT NULL DEFAULT 5,
    "parentId" TEXT,
    "territoryId" TEXT,
    "campaignId" TEXT,
    "metaSimpatizantes" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "path" TEXT NOT NULL DEFAULT '',
    "depth" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StructureNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'SIMPATIZANTES',
    "target" INTEGER NOT NULL DEFAULT 0,
    "nodeId" TEXT,
    "territoryId" TEXT,
    "campaignId" TEXT,
    "desde" TIMESTAMP(3),
    "hasta" TIMESTAMP(3),
    "notas" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataQualityFlag" (
    "id" TEXT NOT NULL,
    "personId" TEXT,
    "tipo" TEXT NOT NULL,
    "severidad" TEXT NOT NULL DEFAULT 'MEDIA',
    "detalle" TEXT,
    "relacionadoCon" TEXT,
    "capturadoPor" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "resueltoPor" TEXT,
    "resueltoAt" TIMESTAMP(3),
    "resolucion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataQualityFlag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StructureNode_userId_key" ON "StructureNode"("userId");

-- CreateIndex
CREATE INDEX "StructureNode_parentId_idx" ON "StructureNode"("parentId");

-- CreateIndex
CREATE INDEX "StructureNode_territoryId_idx" ON "StructureNode"("territoryId");

-- CreateIndex
CREATE INDEX "StructureNode_campaignId_idx" ON "StructureNode"("campaignId");

-- CreateIndex
CREATE INDEX "StructureNode_path_idx" ON "StructureNode"("path");

-- CreateIndex
CREATE INDEX "StructureNode_rol_idx" ON "StructureNode"("rol");

-- CreateIndex
CREATE INDEX "StructureNode_activo_idx" ON "StructureNode"("activo");

-- CreateIndex
CREATE INDEX "Goal_nodeId_idx" ON "Goal"("nodeId");

-- CreateIndex
CREATE INDEX "Goal_territoryId_idx" ON "Goal"("territoryId");

-- CreateIndex
CREATE INDEX "Goal_campaignId_idx" ON "Goal"("campaignId");

-- CreateIndex
CREATE INDEX "Goal_tipo_idx" ON "Goal"("tipo");

-- CreateIndex
CREATE INDEX "DataQualityFlag_personId_idx" ON "DataQualityFlag"("personId");

-- CreateIndex
CREATE INDEX "DataQualityFlag_tipo_idx" ON "DataQualityFlag"("tipo");

-- CreateIndex
CREATE INDEX "DataQualityFlag_estado_idx" ON "DataQualityFlag"("estado");

-- CreateIndex
CREATE INDEX "DataQualityFlag_severidad_idx" ON "DataQualityFlag"("severidad");

-- CreateIndex
CREATE INDEX "DataQualityFlag_capturadoPor_idx" ON "DataQualityFlag"("capturadoPor");

-- CreateIndex
CREATE INDEX "Person_promotorId_idx" ON "Person"("promotorId");

-- CreateIndex
CREATE INDEX "Person_afinidad_idx" ON "Person"("afinidad");

-- CreateIndex
CREATE INDEX "Person_compromisoVoto_idx" ON "Person"("compromisoVoto");

-- CreateIndex
CREATE INDEX "Person_verificado_idx" ON "Person"("verificado");

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_promotorId_fkey" FOREIGN KEY ("promotorId") REFERENCES "StructureNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StructureNode" ADD CONSTRAINT "StructureNode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StructureNode" ADD CONSTRAINT "StructureNode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "StructureNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StructureNode" ADD CONSTRAINT "StructureNode_territoryId_fkey" FOREIGN KEY ("territoryId") REFERENCES "Territory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StructureNode" ADD CONSTRAINT "StructureNode_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "StructureNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_territoryId_fkey" FOREIGN KEY ("territoryId") REFERENCES "Territory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataQualityFlag" ADD CONSTRAINT "DataQualityFlag_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
