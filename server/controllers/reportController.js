/**
 * controllers/reportController.js
 * Expedientes de gestión ciudadana.
 *
 * La evidencia fotográfica ya no viaja en base64 dentro de la fila: se guarda
 * en disco y el reporte conserva solo la URL. El listado se acota al
 * territorio del usuario y admite filtros y folio.
 */

const prisma = require('../services/db');
const { analyzeReport } = require('../services/aiService');
const { audit } = require('../services/auditService');
const { saveImage, deleteForOwner } = require('../services/storage');
const { reportScope, withScope } = require('../services/scope');

const MAX_LIMIT = 200;

/** Folio legible y consecutivo por año: CAM-2026-000123 */
const nextFolio = async () => {
  const year = new Date().getFullYear();
  const count = await prisma.report.count({
    where: { createdAt: { gte: new Date(`${year}-01-01T00:00:00.000Z`) } }
  });
  return `CAM-${year}-${String(count + 1).padStart(6, '0')}`;
};

const shape = (r) => ({
  ...r,
  location: { lat: r.lat, lng: r.lng },
  hasEvidence: Boolean(r.evidenceUrl || r.evidenceGallery),
  evidenceGallery: r.evidenceGallery ? safeParse(r.evidenceGallery, []) : []
});

const safeParse = (str, fallback) => {
  try { return JSON.parse(str); } catch { return fallback; }
};

// ───────────────────────────────────────────────────────────────────────────
// GET /api/reports
// ───────────────────────────────────────────────────────────────────────────
const getReports = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const { status, needType, municipio, assignedTo, urgency, search, desde, hasta } = req.query;
    const filters = [];

    if (status) filters.push({ status: String(status) });
    if (needType) filters.push({ needType: String(needType) });
    if (municipio) filters.push({ municipio: String(municipio) });
    if (assignedTo) filters.push({ assignedTo: String(assignedTo) });
    if (urgency) filters.push({ urgency: String(urgency) });
    if (search) {
      filters.push({
        OR: [
          { folio: { contains: String(search), mode: 'insensitive' } },
          { description: { contains: String(search), mode: 'insensitive' } },
          { comunidad: { contains: String(search), mode: 'insensitive' } }
        ]
      });
    }
    if (desde || hasta) {
      const createdAt = {};
      if (desde) createdAt.gte = new Date(desde);
      if (hasta) createdAt.lte = new Date(`${hasta}T23:59:59.999Z`);
      filters.push({ createdAt });
    }

    const scope = await reportScope(req.user);
    const where = withScope(scope, filters.length ? { AND: filters } : {});

    const [total, reports] = await Promise.all([
      prisma.report.count({ where }),
      prisma.report.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, folio: true, municipio: true, comunidad: true,
          lat: true, lng: true, needType: true, description: true,
          timestamp: true, status: true, user: true, assignedTo: true,
          syncedAt: true, response: true, resolvedAt: true, dueAt: true,
          evidenceUrl: true, evidenceGallery: true,
          sentiment: true, urgency: true, createdAt: true
        }
      })
    ]);

    res.json({
      data: reports.map(shape),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit) || 1
    });
  } catch (error) {
    console.error('Error al listar reportes:', error);
    res.status(500).json({ error: 'Error al obtener reportes' });
  }
};

// ───────────────────────────────────────────────────────────────────────────
// GET /api/reports/stats
// ───────────────────────────────────────────────────────────────────────────
const getReportStats = async (req, res) => {
  try {
    const scope = await reportScope(req.user);

    const [total, porEstatus, porTipo, porMunicipio, resueltos, ultimos7] = await Promise.all([
      prisma.report.count({ where: scope }),
      prisma.report.groupBy({ by: ['status'], where: scope, _count: { _all: true } }),
      prisma.report.groupBy({
        by: ['needType'], where: scope, _count: { _all: true },
        orderBy: { _count: { needType: 'desc' } }, take: 12
      }),
      prisma.report.groupBy({
        by: ['municipio'], where: scope, _count: { _all: true },
        orderBy: { _count: { municipio: 'desc' } }, take: 12
      }),
      prisma.report.count({ where: withScope(scope, { status: 'Resuelto' }) }),
      prisma.report.count({
        where: withScope(scope, {
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        })
      })
    ]);

    res.json({
      total,
      resueltos,
      pendientes: total - resueltos,
      tasaResolucion: total > 0 ? resueltos / total : 0,
      ultimos7dias: ultimos7,
      porEstatus: porEstatus.map(s => ({ status: s.status, total: s._count._all })),
      porTipo: porTipo.map(t => ({ needType: t.needType || 'Sin tipo', total: t._count._all })),
      porMunicipio: porMunicipio.map(m => ({
        municipio: m.municipio || 'Sin municipio', total: m._count._all
      }))
    });
  } catch (error) {
    console.error('Error en estadísticas de reportes:', error);
    res.status(500).json({ error: 'Error al calcular estadísticas' });
  }
};

// ───────────────────────────────────────────────────────────────────────────
// GET /api/reports/map
// ───────────────────────────────────────────────────────────────────────────
const getReportsMap = async (req, res) => {
  try {
    const scope = await reportScope(req.user);
    const points = await prisma.report.findMany({
      where: withScope(scope, { lat: { not: null }, lng: { not: null } }),
      select: {
        id: true, folio: true, lat: true, lng: true,
        needType: true, status: true, urgency: true, municipio: true, comunidad: true
      },
      take: Math.min(5000, parseInt(req.query.limit, 10) || 2000)
    });
    res.json(points);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener puntos del mapa' });
  }
};

// ───────────────────────────────────────────────────────────────────────────
// POST /api/reports
// ───────────────────────────────────────────────────────────────────────────
const createReport = async (req, res) => {
  try {
    const d = { ...req.body };

    let sentiment = null;
    let urgency = null;
    if (d.description && process.env.GEMINI_API_KEY) {
      const ai = await analyzeReport(d.description, d.needType);
      if (ai) { sentiment = ai.sentiment; urgency = ai.urgency; }
    }

    const campaign = req.user?.campaignId
      ? { id: req.user.campaignId }
      : await prisma.campaign.findFirst({ where: { isDefault: true } });

    const saved = await prisma.report.create({
      data: {
        folio: await nextFolio(),
        municipio: d.municipio,
        comunidad: d.comunidad,
        lat: d.location?.lat ?? d.lat ?? null,
        lng: d.location?.lng ?? d.lng ?? null,
        needType: d.needType,
        description: d.description,
        timestamp: d.timestamp,
        user: d.user || req.user?.username || null,
        campaignId: campaign?.id ?? null,
        sentiment,
        urgency,
        customData: typeof d.customData === 'object'
          ? JSON.stringify(d.customData)
          : d.customData,
        response: d.response || null
      }
    });

    // La evidencia va a disco, nunca a la fila.
    let evidenceUrl = null;
    const galleryUrls = [];

    if (d.evidenceBase64) {
      const s = await saveImage({
        data: d.evidenceBase64, kind: 'REPORT_EVIDENCE',
        ownerType: 'Report', ownerId: saved.id, uploadedBy: req.user?.username
      });
      if (s) evidenceUrl = s.url;
    }

    if (Array.isArray(d.evidenceGallery)) {
      for (const img of d.evidenceGallery) {
        if (!img) continue;
        // Puede venir ya como URL (reenvío) o como base64 (captura nueva).
        if (typeof img === 'string' && img.startsWith('/api/media/')) {
          galleryUrls.push(img);
          continue;
        }
        const s = await saveImage({
          data: img, kind: 'REPORT_EVIDENCE',
          ownerType: 'Report', ownerId: saved.id, uploadedBy: req.user?.username
        });
        if (s) galleryUrls.push(s.url);
      }
    }

    if (evidenceUrl || galleryUrls.length) {
      await prisma.report.update({
        where: { id: saved.id },
        data: {
          evidenceUrl: evidenceUrl || galleryUrls[0] || null,
          evidenceGallery: galleryUrls.length ? JSON.stringify(galleryUrls) : null
        }
      });
    }

    audit(req, 'CREATE', 'Report', saved.id,
      `${d.needType || 'Reporte'} en ${d.comunidad || d.municipio || 's/ubicación'}`);

    res.status(201).json({ message: 'Sincronización exitosa', id: saved.id, folio: saved.folio });
  } catch (error) {
    console.error('Error al guardar reporte:', error);
    res.status(500).json({ error: 'Error al guardar el reporte' });
  }
};

// ───────────────────────────────────────────────────────────────────────────
// GET /api/reports/:id
// ───────────────────────────────────────────────────────────────────────────
const getReportById = async (req, res) => {
  try {
    const report = await prisma.report.findUnique({ where: { id: req.params.id } });
    if (!report) return res.status(404).json({ error: 'Reporte no encontrado' });
    res.json(shape(report));
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener reporte' });
  }
};

// Campos que la API acepta modificar. Evita escribir columnas arbitrarias.
const UPDATABLE_REPORT_FIELDS = [
  'municipio', 'comunidad', 'lat', 'lng', 'needType', 'description',
  'status', 'assignedTo', 'response', 'resolvedAt', 'sentiment', 'urgency',
  'customData', 'evidenceGallery', 'evidenceUrl', 'dueAt'
];

// ───────────────────────────────────────────────────────────────────────────
// PUT /api/reports/:id
// ───────────────────────────────────────────────────────────────────────────
const updateReport = async (req, res) => {
  try {
    const previous = await prisma.report.findUnique({ where: { id: req.params.id } });
    if (!previous) return res.status(404).json({ error: 'Reporte no encontrado' });

    const updateData = {};
    for (const field of UPDATABLE_REPORT_FIELDS) {
      if (field in req.body) updateData[field] = req.body[field];
    }

    if (Array.isArray(updateData.evidenceGallery)) {
      updateData.evidenceGallery = JSON.stringify(updateData.evidenceGallery);
    }
    if (updateData.customData && typeof updateData.customData === 'object') {
      updateData.customData = JSON.stringify(updateData.customData);
    }
    if (updateData.status === 'Resuelto' && previous.status !== 'Resuelto' && !updateData.resolvedAt) {
      updateData.resolvedAt = new Date();
    }

    // Evidencia nueva en base64
    if (req.body.evidenceBase64) {
      const s = await saveImage({
        data: req.body.evidenceBase64, kind: 'REPORT_EVIDENCE',
        ownerType: 'Report', ownerId: req.params.id, uploadedBy: req.user?.username
      });
      if (s) updateData.evidenceUrl = s.url;
    }

    const updated = await prisma.report.update({
      where: { id: req.params.id },
      data: updateData
    });

    const username = req.user?.username || null;
    const historyEntries = [];

    if ('status' in updateData && updateData.status !== previous.status) {
      historyEntries.push({
        reportId: updated.id, username, action: 'STATUS_CHANGE',
        fromStatus: previous.status, toStatus: updateData.status,
        note: req.body.note || null
      });
    }
    if ('assignedTo' in updateData && updateData.assignedTo !== previous.assignedTo) {
      historyEntries.push({
        reportId: updated.id, username, action: 'ASSIGNED',
        note: updateData.assignedTo ? `Asignado a ${updateData.assignedTo}` : 'Asignación removida'
      });
    }
    if ('response' in updateData && updateData.response !== previous.response && updateData.response) {
      historyEntries.push({
        reportId: updated.id, username, action: 'COMMENT', note: updateData.response
      });
    }
    if (historyEntries.length) {
      await prisma.reportHistory.createMany({ data: historyEntries });
    }

    audit(req, 'UPDATE', 'Report', updated.id,
      historyEntries.map(h => h.action).join(', ') || 'Edición de datos');

    res.json(shape(updated));
  } catch (error) {
    console.error('Error al actualizar reporte:', error);
    res.status(500).json({ error: 'Error al actualizar reporte' });
  }
};

// ───────────────────────────────────────────────────────────────────────────
// DELETE /api/reports/:id
// ───────────────────────────────────────────────────────────────────────────
const deleteReport = async (req, res) => {
  try {
    await deleteForOwner('Report', req.params.id);
    await prisma.report.delete({ where: { id: req.params.id } });
    audit(req, 'DELETE', 'Report', req.params.id);
    res.json({ message: 'Reporte eliminado' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar reporte' });
  }
};

const getReportHistory = async (req, res) => {
  try {
    const history = await prisma.reportHistory.findMany({
      where: { reportId: req.params.id },
      orderBy: { createdAt: 'desc' }
    });
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener historial' });
  }
};

module.exports = {
  getReports, getReportStats, getReportsMap, createReport,
  getReportById, updateReport, deleteReport, getReportHistory
};
