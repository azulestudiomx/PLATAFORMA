-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "aforoEsperado" INTEGER,
ADD COLUMN     "aforoReal" INTEGER,
ADD COLUMN     "contactoLocal" TEXT,
ADD COLUMN     "costo" DECIMAL(12,2),
ADD COLUMN     "estado" TEXT NOT NULL DEFAULT 'PLANEADO',
ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lng" DOUBLE PRECISION,
ADD COLUMN     "responsableAvanzada" TEXT,
ADD COLUMN     "telefonoLocal" TEXT,
ADD COLUMN     "territoryId" TEXT;

-- CreateTable
CREATE TABLE "Brigade" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "vehiculo" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "jefeId" TEXT,
    "territoryId" TEXT,
    "campaignId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Brigade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrigadeMember" (
    "id" TEXT NOT NULL,
    "brigadeId" TEXT NOT NULL,
    "userId" TEXT,
    "nombre" TEXT NOT NULL,
    "rol" TEXT NOT NULL DEFAULT 'BRIGADISTA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrigadeMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrigadeShift" (
    "id" TEXT NOT NULL,
    "brigadeId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "territoryId" TEXT,
    "checkInAt" TIMESTAMP(3),
    "checkInLat" DOUBLE PRECISION,
    "checkInLng" DOUBLE PRECISION,
    "checkInKm" DOUBLE PRECISION,
    "dentroDeZona" BOOLEAN NOT NULL DEFAULT false,
    "checkOutAt" TIMESTAMP(3),
    "checkOutLat" DOUBLE PRECISION,
    "checkOutLng" DOUBLE PRECISION,
    "metaVisitas" INTEGER NOT NULL DEFAULT 0,
    "estado" TEXT NOT NULL DEFAULT 'PLANEADA',
    "notas" TEXT,
    "resumen" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrigadeShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Visit" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT,
    "brigadeId" TEXT,
    "personId" TEXT,
    "direccion" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "territoryId" TEXT,
    "resultado" TEXT NOT NULL DEFAULT 'CONTACTADO',
    "notas" TEXT,
    "evidenciaUrl" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Visit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Survey" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "anonima" BOOLEAN NOT NULL DEFAULT false,
    "campaignId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Survey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyQuestion" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "texto" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'UNICA',
    "opciones" TEXT NOT NULL DEFAULT '[]',
    "requerida" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SurveyQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyResponse" (
    "id" TEXT NOT NULL,
    "surveyId" TEXT NOT NULL,
    "personId" TEXT,
    "territoryId" TEXT,
    "seccion" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SurveyResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyAnswer" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "valor" TEXT,
    "valorNum" DOUBLE PRECISION,

    CONSTRAINT "SurveyAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageCampaign" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "canal" TEXT NOT NULL DEFAULT 'WHATSAPP',
    "plantilla" TEXT NOT NULL,
    "segmento" TEXT NOT NULL DEFAULT '{}',
    "estado" TEXT NOT NULL DEFAULT 'BORRADOR',
    "simulado" BOOLEAN NOT NULL DEFAULT true,
    "programadaPara" TIMESTAMP(3),
    "enviadaAt" TIMESTAMP(3),
    "totalDestinatarios" INTEGER NOT NULL DEFAULT 0,
    "enviados" INTEGER NOT NULL DEFAULT 0,
    "fallidos" INTEGER NOT NULL DEFAULT 0,
    "campaignId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "messageCampaignId" TEXT NOT NULL,
    "personId" TEXT,
    "destino" TEXT NOT NULL,
    "cuerpo" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "error" TEXT,
    "enviadoAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventAttendee" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "personId" TEXT,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'ASISTIO',
    "registradoPor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventAttendee_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Brigade_territoryId_idx" ON "Brigade"("territoryId");

-- CreateIndex
CREATE INDEX "Brigade_campaignId_idx" ON "Brigade"("campaignId");

-- CreateIndex
CREATE INDEX "Brigade_activa_idx" ON "Brigade"("activa");

-- CreateIndex
CREATE INDEX "BrigadeMember_brigadeId_idx" ON "BrigadeMember"("brigadeId");

-- CreateIndex
CREATE INDEX "BrigadeMember_userId_idx" ON "BrigadeMember"("userId");

-- CreateIndex
CREATE INDEX "BrigadeShift_brigadeId_idx" ON "BrigadeShift"("brigadeId");

-- CreateIndex
CREATE INDEX "BrigadeShift_fecha_idx" ON "BrigadeShift"("fecha");

-- CreateIndex
CREATE INDEX "BrigadeShift_estado_idx" ON "BrigadeShift"("estado");

-- CreateIndex
CREATE INDEX "BrigadeShift_territoryId_idx" ON "BrigadeShift"("territoryId");

-- CreateIndex
CREATE INDEX "Visit_shiftId_idx" ON "Visit"("shiftId");

-- CreateIndex
CREATE INDEX "Visit_brigadeId_idx" ON "Visit"("brigadeId");

-- CreateIndex
CREATE INDEX "Visit_personId_idx" ON "Visit"("personId");

-- CreateIndex
CREATE INDEX "Visit_territoryId_idx" ON "Visit"("territoryId");

-- CreateIndex
CREATE INDEX "Visit_resultado_idx" ON "Visit"("resultado");

-- CreateIndex
CREATE INDEX "Visit_createdAt_idx" ON "Visit"("createdAt");

-- CreateIndex
CREATE INDEX "Survey_activa_idx" ON "Survey"("activa");

-- CreateIndex
CREATE INDEX "Survey_campaignId_idx" ON "Survey"("campaignId");

-- CreateIndex
CREATE INDEX "SurveyQuestion_surveyId_idx" ON "SurveyQuestion"("surveyId");

-- CreateIndex
CREATE INDEX "SurveyResponse_surveyId_idx" ON "SurveyResponse"("surveyId");

-- CreateIndex
CREATE INDEX "SurveyResponse_personId_idx" ON "SurveyResponse"("personId");

-- CreateIndex
CREATE INDEX "SurveyResponse_territoryId_idx" ON "SurveyResponse"("territoryId");

-- CreateIndex
CREATE INDEX "SurveyResponse_seccion_idx" ON "SurveyResponse"("seccion");

-- CreateIndex
CREATE INDEX "SurveyResponse_createdAt_idx" ON "SurveyResponse"("createdAt");

-- CreateIndex
CREATE INDEX "SurveyAnswer_responseId_idx" ON "SurveyAnswer"("responseId");

-- CreateIndex
CREATE INDEX "SurveyAnswer_questionId_idx" ON "SurveyAnswer"("questionId");

-- CreateIndex
CREATE INDEX "MessageCampaign_estado_idx" ON "MessageCampaign"("estado");

-- CreateIndex
CREATE INDEX "MessageCampaign_campaignId_idx" ON "MessageCampaign"("campaignId");

-- CreateIndex
CREATE INDEX "Message_messageCampaignId_idx" ON "Message"("messageCampaignId");

-- CreateIndex
CREATE INDEX "Message_personId_idx" ON "Message"("personId");

-- CreateIndex
CREATE INDEX "Message_estado_idx" ON "Message"("estado");

-- CreateIndex
CREATE INDEX "EventAttendee_eventId_idx" ON "EventAttendee"("eventId");

-- CreateIndex
CREATE INDEX "EventAttendee_personId_idx" ON "EventAttendee"("personId");

-- CreateIndex
CREATE INDEX "Event_territoryId_idx" ON "Event"("territoryId");

-- CreateIndex
CREATE INDEX "Event_estado_idx" ON "Event"("estado");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_territoryId_fkey" FOREIGN KEY ("territoryId") REFERENCES "Territory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Brigade" ADD CONSTRAINT "Brigade_jefeId_fkey" FOREIGN KEY ("jefeId") REFERENCES "StructureNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Brigade" ADD CONSTRAINT "Brigade_territoryId_fkey" FOREIGN KEY ("territoryId") REFERENCES "Territory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Brigade" ADD CONSTRAINT "Brigade_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrigadeMember" ADD CONSTRAINT "BrigadeMember_brigadeId_fkey" FOREIGN KEY ("brigadeId") REFERENCES "Brigade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrigadeMember" ADD CONSTRAINT "BrigadeMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrigadeShift" ADD CONSTRAINT "BrigadeShift_brigadeId_fkey" FOREIGN KEY ("brigadeId") REFERENCES "Brigade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrigadeShift" ADD CONSTRAINT "BrigadeShift_territoryId_fkey" FOREIGN KEY ("territoryId") REFERENCES "Territory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "BrigadeShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_brigadeId_fkey" FOREIGN KEY ("brigadeId") REFERENCES "Brigade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_territoryId_fkey" FOREIGN KEY ("territoryId") REFERENCES "Territory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Survey" ADD CONSTRAINT "Survey_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyQuestion" ADD CONSTRAINT "SurveyQuestion_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyResponse" ADD CONSTRAINT "SurveyResponse_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyResponse" ADD CONSTRAINT "SurveyResponse_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyResponse" ADD CONSTRAINT "SurveyResponse_territoryId_fkey" FOREIGN KEY ("territoryId") REFERENCES "Territory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyAnswer" ADD CONSTRAINT "SurveyAnswer_responseId_fkey" FOREIGN KEY ("responseId") REFERENCES "SurveyResponse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyAnswer" ADD CONSTRAINT "SurveyAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "SurveyQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageCampaign" ADD CONSTRAINT "MessageCampaign_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_messageCampaignId_fkey" FOREIGN KEY ("messageCampaignId") REFERENCES "MessageCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAttendee" ADD CONSTRAINT "EventAttendee_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventAttendee" ADD CONSTRAINT "EventAttendee_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
