/**
 * controllers/territoryController.js
 * Consulta del árbol territorial y del avance de captura por territorio.
 */

const prisma = require('../services/db');
const { getTree, seedTerritories } = require('../services/territoryService');
const { descendantTerritoryIds } = require('../services/scope');

// GET /api/territories/tree
const tree = async (req, res) => {
  try {
    const maxDepth = Math.min(4, parseInt(req.query.maxDepth, 10) || 3);
    res.json(await getTree({ maxDepth }));
  } catch (error) {
    console.error('Error al obtener el árbol territorial:', error);
    res.status(500).json({ error: 'Error al obtener el árbol territorial' });
  }
};

// GET /api/territories?type=SECCION&parentId=...
const list = async (req, res) => {
  try {
    const { type, parentId, search } = req.query;
    const where = {};
    if (type) where.type = String(type);
    if (parentId) where.parentId = String(parentId);
    if (search) {
      where.OR = [
        { name: { contains: String(search), mode: 'insensitive' } },
        { code: { contains: String(search) } }
      ];
    }

    const territories = await prisma.territory.findMany({
      where,
      orderBy: [{ depth: 'asc' }, { code: 'asc' }],
      take: 1000,
      select: {
        id: true, type: true, code: true, name: true, parentId: true,
        listaNominal: true, casillas: true, tipoSeccion: true,
        distritoF: true, distritoL: true, lat: true, lng: true, depth: true
      }
    });

    res.json(territories);
  } catch (error) {
    res.status(500).json({ error: 'Error al listar territorios' });
  }
};

// GET /api/territories/:id/avance — cobertura del padrón contra lista nominal
const avance = async (req, res) => {
  try {
    const territory = await prisma.territory.findUnique({ where: { id: req.params.id } });
    if (!territory) return res.status(404).json({ error: 'Territorio no encontrado' });

    const ids = await descendantTerritoryIds(territory.id);

    const [personas, listaNominal, hijos] = await Promise.all([
      prisma.person.count({ where: { territoryId: { in: ids } } }),
      prisma.territory.aggregate({
        where: { id: { in: ids }, type: 'SECCION' },
        _sum: { listaNominal: true }
      }),
      prisma.territory.findMany({
        where: { parentId: territory.id },
        select: { id: true, name: true, code: true, type: true, listaNominal: true },
        orderBy: { code: 'asc' }
      })
    ]);

    // Avance de cada hijo directo, para pintar la tabla de un vistazo.
    const detalle = [];
    for (const h of hijos) {
      const hIds = await descendantTerritoryIds(h.id);
      const hPersonas = await prisma.person.count({ where: { territoryId: { in: hIds } } });
      const hLista = await prisma.territory.aggregate({
        where: { id: { in: hIds }, type: 'SECCION' },
        _sum: { listaNominal: true }
      });
      const ln = hLista._sum.listaNominal || h.listaNominal || 0;
      detalle.push({
        ...h,
        personas: hPersonas,
        listaNominal: ln,
        cobertura: ln > 0 ? hPersonas / ln : null
      });
    }

    const ln = listaNominal._sum.listaNominal || territory.listaNominal || 0;

    res.json({
      territorio: {
        id: territory.id, name: territory.name, type: territory.type, code: territory.code
      },
      personas,
      listaNominal: ln,
      cobertura: ln > 0 ? personas / ln : null,
      detalle: detalle.sort((a, b) => (b.cobertura ?? -1) - (a.cobertura ?? -1))
    });
  } catch (error) {
    console.error('Error al calcular avance territorial:', error);
    res.status(500).json({ error: 'Error al calcular el avance' });
  }
};

// POST /api/territories/seed — vuelve a sembrar el árbol (solo nivel 0)
const seed = async (req, res) => {
  try {
    const result = await seedTerritories({ verbose: false });
    res.json({ message: 'Árbol territorial actualizado', ...result });
  } catch (error) {
    console.error('Error al sembrar territorios:', error);
    res.status(500).json({ error: 'Error al sembrar el árbol territorial' });
  }
};

module.exports = { tree, list, avance, seed };
