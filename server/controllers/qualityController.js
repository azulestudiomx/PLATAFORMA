/**
 * controllers/qualityController.js
 * Tablero de calidad del padrón: marcas, revisión y confianza por capturista.
 */

const prisma = require('../services/db');
const { audit } = require('../services/auditService');
const quality = require('../services/qualityService');

// GET /api/quality/resumen
const resumen = async (req, res) => {
  try {
    res.json(await quality.resumen());
  } catch (error) {
    console.error('Error en resumen de calidad:', error);
    res.status(500).json({ error: 'Error al calcular el resumen de calidad' });
  }
};

// POST /api/quality/analizar — corre todos los detectores
const analizar = async (req, res) => {
  try {
    const inicio = Date.now();
    const resultados = await quality.ejecutarAnalisis();
    const segundos = ((Date.now() - inicio) / 1000).toFixed(1);

    audit(req, 'UPDATE', 'DataQualityFlag', null,
      `análisis de calidad: ${resultados.total} marcas nuevas`);

    res.json({
      ...resultados,
      duracionSegundos: Number(segundos),
      mensaje: resultados.total === 0
        ? 'No se encontraron problemas nuevos.'
        : `Se levantaron ${resultados.total} marcas nuevas.`
    });
  } catch (error) {
    console.error('Error al ejecutar el análisis de calidad:', error);
    res.status(500).json({ error: 'Error al ejecutar el análisis' });
  }
};

// GET /api/quality/flags
const listFlags = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const { tipo, severidad, estado, capturadoPor } = req.query;

    const where = {};
    if (tipo) where.tipo = String(tipo);
    if (severidad) where.severidad = String(severidad);
    if (estado) where.estado = String(estado);
    if (capturadoPor) where.capturadoPor = String(capturadoPor);

    const [total, flags] = await Promise.all([
      prisma.dataQualityFlag.count({ where }),
      prisma.dataQualityFlag.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: [{ severidad: 'asc' }, { createdAt: 'desc' }],
        include: {
          person: {
            select: {
              id: true, name: true, seccion: true, municipio: true,
              phone: true, createdBy: true, createdAt: true
            }
          }
        }
      })
    ]);

    res.json({ data: flags, total, page, limit, pages: Math.ceil(total / limit) || 1 });
  } catch (error) {
    console.error('Error al listar marcas de calidad:', error);
    res.status(500).json({ error: 'Error al listar las marcas' });
  }
};

// PUT /api/quality/flags/:id — confirmar, descartar o marcar como corregido
const resolveFlag = async (req, res) => {
  try {
    const { estado, resolucion } = req.body;
    const validos = ['PENDIENTE', 'CONFIRMADO', 'DESCARTADO', 'CORREGIDO'];
    if (!validos.includes(estado)) {
      return res.status(400).json({ error: `Estado inválido. Usa: ${validos.join(', ')}` });
    }

    const flag = await prisma.dataQualityFlag.update({
      where: { id: req.params.id },
      data: {
        estado,
        resolucion: resolucion || null,
        resueltoPor: req.user.username,
        resueltoAt: estado === 'PENDIENTE' ? null : new Date()
      },
      include: { person: { select: { name: true } } }
    });

    audit(req, 'UPDATE', 'DataQualityFlag', flag.id,
      `${flag.tipo} → ${estado}${flag.person ? ` (${flag.person.name})` : ''}`);
    res.json(flag);
  } catch (error) {
    console.error('Error al resolver marca:', error);
    res.status(500).json({ error: 'Error al resolver la marca' });
  }
};

// POST /api/quality/flags/bulk — resolver varias de golpe
const bulkResolve = async (req, res) => {
  try {
    const { ids, estado, resolucion } = req.body;
    if (!Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ error: 'No se recibieron marcas' });
    }
    const validos = ['PENDIENTE', 'CONFIRMADO', 'DESCARTADO', 'CORREGIDO'];
    if (!validos.includes(estado)) {
      return res.status(400).json({ error: `Estado inválido. Usa: ${validos.join(', ')}` });
    }

    const r = await prisma.dataQualityFlag.updateMany({
      where: { id: { in: ids } },
      data: {
        estado,
        resolucion: resolucion || null,
        resueltoPor: req.user.username,
        resueltoAt: estado === 'PENDIENTE' ? null : new Date()
      }
    });

    audit(req, 'UPDATE', 'DataQualityFlag', null, `${r.count} marcas → ${estado}`);
    res.json({ actualizadas: r.count });
  } catch (error) {
    res.status(500).json({ error: 'Error al resolver las marcas' });
  }
};

// GET /api/quality/capturistas
const capturistas = async (req, res) => {
  try {
    res.json(await quality.confianzaPorCapturista());
  } catch (error) {
    console.error('Error al calcular confianza:', error);
    res.status(500).json({ error: 'Error al calcular la confianza por capturista' });
  }
};

module.exports = { resumen, analizar, listFlags, resolveFlag, bulkResolve, capturistas };
