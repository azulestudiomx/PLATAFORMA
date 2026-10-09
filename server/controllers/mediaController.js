/**
 * controllers/mediaController.js
 * Entrega los archivos que viven en disco, con control de acceso.
 *
 * La foto de la credencial de elector está marcada como sensible: solo la
 * ve un rol de nivel 2 o superior, y cada consulta queda en la bitácora.
 */

const fs = require('fs');
const prisma = require('../services/db');
const { absolutePath, saveImage } = require('../services/storage');
const { audit } = require('../services/auditService');

// GET /api/media/:id[?size=thumb]
const serve = async (req, res) => {
  try {
    const asset = await prisma.mediaAsset.findUnique({ where: { id: req.params.id } });
    if (!asset) return res.status(404).json({ error: 'Archivo no encontrado' });

    if (asset.sensitive && !req.user?.canSeeSensitive) {
      return res.status(403).json({ error: 'Tu rol no puede ver este archivo' });
    }

    if (asset.sensitive) {
      audit(req, 'VIEW_SENSITIVE', asset.ownerType, asset.ownerId, `archivo ${asset.kind}`);
    }

    const size = req.query.size === 'thumb' ? 'thumb' : 'full';
    const abs = absolutePath(asset, size);

    if (!fs.existsSync(abs)) {
      return res.status(404).json({ error: 'El archivo ya no está en el almacenamiento' });
    }

    // Los archivos son inmutables: se nombran por su huella, así que se
    // pueden cachear indefinidamente.
    res.setHeader('Content-Type', asset.mime);
    res.setHeader('Cache-Control', asset.sensitive ? 'private, max-age=300' : 'private, max-age=31536000, immutable');
    res.setHeader('ETag', `"${asset.sha256}-${size}"`);

    if (req.headers['if-none-match'] === `"${asset.sha256}-${size}"`) {
      return res.status(304).end();
    }

    fs.createReadStream(abs).pipe(res);
  } catch (error) {
    console.error('Error al servir archivo:', error);
    res.status(500).json({ error: 'Error al servir el archivo' });
  }
};

// POST /api/media — sube una imagen suelta en base64
const upload = async (req, res) => {
  try {
    const { data, kind = 'REPORT_EVIDENCE', ownerType, ownerId, sensitive } = req.body;
    if (!data) return res.status(400).json({ error: 'No se recibió ninguna imagen' });
    if (!ownerType || !ownerId) {
      return res.status(400).json({ error: 'Falta indicar a qué registro pertenece' });
    }

    const saved = await saveImage({
      data, kind, ownerType, ownerId,
      uploadedBy: req.user?.username,
      sensitive: Boolean(sensitive)
    });

    if (!saved) return res.status(400).json({ error: 'La imagen no es válida' });

    res.status(201).json({
      id: saved.asset.id,
      url: saved.url,
      thumbUrl: saved.thumbUrl,
      bytes: saved.asset.bytes
    });
  } catch (error) {
    console.error('Error al subir archivo:', error);
    res.status(500).json({ error: 'Error al guardar la imagen' });
  }
};

// GET /api/media?ownerType=Report&ownerId=xxx
const listForOwner = async (req, res) => {
  try {
    const { ownerType, ownerId } = req.query;
    if (!ownerType || !ownerId) {
      return res.status(400).json({ error: 'Indica ownerType y ownerId' });
    }

    const assets = await prisma.mediaAsset.findMany({
      where: { ownerType: String(ownerType), ownerId: String(ownerId) },
      orderBy: { createdAt: 'asc' }
    });

    res.json(assets
      .filter(a => !a.sensitive || req.user?.canSeeSensitive)
      .map(a => ({
        id: a.id,
        kind: a.kind,
        url: `/api/media/${a.id}`,
        thumbUrl: `/api/media/${a.id}?size=thumb`,
        bytes: a.bytes,
        width: a.width,
        height: a.height,
        sensitive: a.sensitive,
        createdAt: a.createdAt
      })));
  } catch (error) {
    res.status(500).json({ error: 'Error al listar archivos' });
  }
};

// GET /api/media/stats — cuánto ocupa el almacenamiento
const storageStats = async (req, res) => {
  try {
    const [agg, porTipo, duplicados] = await Promise.all([
      prisma.mediaAsset.aggregate({ _count: { _all: true }, _sum: { bytes: true } }),
      prisma.mediaAsset.groupBy({
        by: ['kind'],
        _count: { _all: true },
        _sum: { bytes: true }
      }),
      prisma.mediaAsset.groupBy({
        by: ['sha256'],
        _count: { _all: true },
        having: { sha256: { _count: { gt: 1 } } }
      })
    ]);

    res.json({
      archivos: agg._count._all,
      bytes: agg._sum.bytes || 0,
      megabytes: Number(((agg._sum.bytes || 0) / 1024 / 1024).toFixed(2)),
      porTipo: porTipo.map(t => ({
        kind: t.kind,
        archivos: t._count._all,
        megabytes: Number(((t._sum.bytes || 0) / 1024 / 1024).toFixed(2))
      })),
      // Una misma foto usada en varios registros suele indicar captura inflada.
      huellasRepetidas: duplicados.length
    });
  } catch (error) {
    console.error('Error en estadísticas de almacenamiento:', error);
    res.status(500).json({ error: 'Error al calcular el almacenamiento' });
  }
};

module.exports = { serve, upload, listForOwner, storageStats };
