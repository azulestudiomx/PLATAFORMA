const prisma = require('../services/db');
const { analyzeReport } = require('../services/aiService');
const { audit } = require('../services/auditService');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const getReports = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const reports = await prisma.report.findMany({
      skip,
      take: limit,
      orderBy: { timestamp: 'desc' },
      select: {
        id: true,
        municipio: true,
        comunidad: true,
        lat: true,
        lng: true,
        needType: true,
        timestamp: true,
        status: true,
        user: true,
        assignedTo: true,
        syncedAt: true,
        response: true,
        resolvedAt: true,
        evidenceUrl: true,
        sentiment: true,
        urgency: true,
        evidenceBase64: true,
        evidenceGallery: true
      }
    });

    const total = await prisma.report.count();

    // Mapping for frontend compatibility
    const mappedReports = reports.map(r => ({
      ...r,
      location: { lat: r.lat, lng: r.lng },
      hasEvidence: !!(r.evidenceBase64 || r.evidenceUrl || r.evidenceGallery),
      evidenceGallery: r.evidenceGallery ? JSON.parse(r.evidenceGallery) : []
    }));

    res.json({
      data: mappedReports,
      total,
      page,
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('Error al listar reportes:', error);
    res.status(500).json({ error: 'Error al obtener reportes' });
  }
};

const createReport = async (req, res) => {
  try {
    const reportData = { ...req.body };
    let evidenceUrl = null;
    let evidenceBase64 = reportData.evidenceBase64;
    let galleryUrls = [];

    // Upload main image
    if (evidenceBase64 && evidenceBase64.startsWith('data:image')) {
      try {
        const uploadResponse = await cloudinary.uploader.upload(evidenceBase64, {
          folder: 'plataforma_ciudadana',
          resource_type: 'image'
        });
        evidenceUrl = uploadResponse.secure_url;
        evidenceBase64 = null; 
      } catch (e) {
        console.error('Error Cloudinary Main:', e.message);
      }
    }

    // Upload gallery images
    if (Array.isArray(reportData.evidenceGallery) && reportData.evidenceGallery.length > 0) {
      for (const img of reportData.evidenceGallery) {
        if (img && img.startsWith('data:image')) {
          try {
            const res = await cloudinary.uploader.upload(img, {
              folder: 'plataforma_ciudadana/gallery',
              resource_type: 'image'
            });
            galleryUrls.push(res.secure_url);
          } catch (e) {
            console.error('Error Cloudinary Gallery Item:', e.message);
            galleryUrls.push(img); // Fallback to base64 if upload fails
          }
        } else {
          galleryUrls.push(img);
        }
      }
    }

    let sentiment = null;
    let urgency = null;

    if (reportData.description && process.env.GEMINI_API_KEY) {
      const aiData = await analyzeReport(reportData.description, reportData.needType);
      if (aiData) {
        sentiment = aiData.sentiment;
        urgency = aiData.urgency;
      }
    }

    const savedReport = await prisma.report.create({
      data: {
        municipio: reportData.municipio,
        comunidad: reportData.comunidad,
        lat: reportData.location?.lat,
        lng: reportData.location?.lng,
        needType: reportData.needType,
        description: reportData.description,
        evidenceBase64: evidenceBase64,
        evidenceUrl: evidenceUrl,
        timestamp: reportData.timestamp,
        user: reportData.user,
        sentiment,
        urgency,
        customData: typeof reportData.customData === 'object' ? JSON.stringify(reportData.customData) : reportData.customData,
        evidenceGallery: galleryUrls.length > 0 ? JSON.stringify(galleryUrls) : null,
        response: reportData.response || null
      }
    });

    audit(req, 'CREATE', 'Report', savedReport.id,
      `${reportData.needType || 'Reporte'} en ${reportData.comunidad || reportData.municipio || 's/ubicación'}`);

    res.status(201).json({ message: 'Sincronización exitosa', id: savedReport.id });
  } catch (error) {
    console.error('Error al guardar reporte:', error);
    res.status(500).json({ error: 'Error al guardar el reporte' });
  }
};

const getReportById = async (req, res) => {
  try {
    const report = await prisma.report.findUnique({ where: { id: req.params.id } });
    if (!report) return res.status(404).json({ error: 'Reporte no encontrado' });
    // Normalize for frontend compatibility (same shape as list endpoint)
    res.json({
      ...report,
      location: { lat: report.lat, lng: report.lng },
      hasEvidence: !!(report.evidenceBase64 || report.evidenceUrl || report.evidenceGallery),
      evidenceGallery: report.evidenceGallery ? JSON.parse(report.evidenceGallery) : []
    });
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener reporte' });
  }
};

// Solo estos campos pueden modificarse vía API; evita escribir columnas arbitrarias
const UPDATABLE_REPORT_FIELDS = [
  'municipio', 'comunidad', 'lat', 'lng', 'needType', 'description',
  'status', 'assignedTo', 'response', 'resolvedAt', 'sentiment', 'urgency',
  'customData', 'evidenceGallery', 'evidenceUrl', 'evidenceBase64'
];

const updateReport = async (req, res) => {
  try {
    const previous = await prisma.report.findUnique({ where: { id: req.params.id } });
    if (!previous) return res.status(404).json({ error: 'Reporte no encontrado' });

    const updateData = {};
    for (const field of UPDATABLE_REPORT_FIELDS) {
      if (field in req.body) updateData[field] = req.body[field];
    }
    if (updateData.evidenceGallery && Array.isArray(updateData.evidenceGallery)) {
      updateData.evidenceGallery = JSON.stringify(updateData.evidenceGallery);
    }
    if (updateData.customData && typeof updateData.customData === 'object') {
       updateData.customData = JSON.stringify(updateData.customData);
    }
    // Al marcar como resuelto, registrar la fecha automáticamente
    if (updateData.status === 'Resuelto' && previous.status !== 'Resuelto' && !updateData.resolvedAt) {
      updateData.resolvedAt = new Date();
    }

    const updated = await prisma.report.update({
      where: { id: req.params.id },
      data: updateData
    });

    // Historial del flujo: cambios de estado y asignación de responsable
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
    if (historyEntries.length > 0) {
      await prisma.reportHistory.createMany({ data: historyEntries });
    }

    audit(req, 'UPDATE', 'Report', updated.id,
      historyEntries.map(h => h.action).join(', ') || 'Edición de datos');

    res.json(updated);
  } catch (error) {
    console.error('Error al actualizar reporte:', error);
    res.status(500).json({ error: 'Error al actualizar reporte' });
  }
};

const deleteReport = async (req, res) => {
  try {
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

module.exports = { getReports, createReport, getReportById, updateReport, deleteReport, getReportHistory };
