/**
 * controllers/structureController.js
 * Red de promoción y metas.
 */

const prisma = require('../services/db');
const { audit } = require('../services/auditService');
const {
  rutaDe, descendantNodeIds, reparent, avanceDeNodo, arbolConAvance, huecosDeEstructura
} = require('../services/structureService');
const { levelOf } = require('../config/roles');

// ───────────────────────────────────────────────────────────────────────────
// GET /api/structure/tree
// ───────────────────────────────────────────────────────────────────────────
const tree = async (req, res) => {
  try {
    // Un coordinador ve su rama; la dirección de campaña ve el árbol completo.
    let rootId = req.query.rootId || null;
    if (!rootId && req.user.level > 2) {
      const propio = await prisma.structureNode.findUnique({
        where: { userId: req.user.id }, select: { id: true }
      });
      rootId = propio?.id || null;
    }

    res.json(await arbolConAvance({
      rootId,
      campaignId: req.user.campaignId || undefined
    }));
  } catch (error) {
    console.error('Error al construir el árbol de estructura:', error);
    res.status(500).json({ error: 'Error al obtener la estructura' });
  }
};

// ───────────────────────────────────────────────────────────────────────────
// GET /api/structure — listado plano, para selectores
// ───────────────────────────────────────────────────────────────────────────
const list = async (req, res) => {
  try {
    const { rol, territoryId, search, activo } = req.query;
    const where = {};
    if (rol) where.rol = String(rol);
    if (territoryId) where.territoryId = String(territoryId);
    if (activo !== undefined) where.activo = activo === 'true';
    if (search) where.nombre = { contains: String(search), mode: 'insensitive' };

    const nodos = await prisma.structureNode.findMany({
      where,
      include: {
        territory: { select: { id: true, name: true, code: true, type: true } },
        user: { select: { id: true, username: true } },
        _count: { select: { personas: true, children: true } }
      },
      orderBy: [{ depth: 'asc' }, { nombre: 'asc' }],
      take: 500
    });

    res.json(nodos);
  } catch (error) {
    res.status(500).json({ error: 'Error al listar la estructura' });
  }
};

// ───────────────────────────────────────────────────────────────────────────
// GET /api/structure/:id/avance
// ───────────────────────────────────────────────────────────────────────────
const avance = async (req, res) => {
  try {
    const data = await avanceDeNodo(req.params.id);
    if (!data) return res.status(404).json({ error: 'Nodo no encontrado' });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: 'Error al calcular el avance' });
  }
};

// ───────────────────────────────────────────────────────────────────────────
// GET /api/structure/huecos — territorios sin responsable
// ───────────────────────────────────────────────────────────────────────────
const huecos = async (req, res) => {
  try {
    res.json(await huecosDeEstructura({
      tipo: req.query.tipo || 'SECCION',
      limit: Math.min(200, parseInt(req.query.limit, 10) || 50)
    }));
  } catch (error) {
    res.status(500).json({ error: 'Error al calcular los huecos de estructura' });
  }
};

// ───────────────────────────────────────────────────────────────────────────
// POST /api/structure
// ───────────────────────────────────────────────────────────────────────────
const create = async (req, res) => {
  try {
    const {
      nombre, telefono, email, rol, parentId, territoryId, userId, metaSimpatizantes
    } = req.body;

    if (!nombre || !String(nombre).trim()) {
      return res.status(400).json({ error: 'El nombre es obligatorio' });
    }
    if (!rol) return res.status(400).json({ error: 'Indica el rol dentro de la red' });

    // Nadie puede colocar en la red a alguien de rango igual o mayor al suyo.
    if (levelOf(rol) <= req.user.level && req.user.level > 0) {
      return res.status(403).json({
        error: 'No puedes crear un nodo con un rol igual o superior al tuyo'
      });
    }

    if (userId) {
      const ocupado = await prisma.structureNode.findUnique({ where: { userId } });
      if (ocupado) {
        return res.status(400).json({ error: 'Esa cuenta ya está ligada a otro nodo' });
      }
    }

    const { path, depth } = await rutaDe(parentId);
    const campaign = req.user.campaignId
      ? { id: req.user.campaignId }
      : await prisma.campaign.findFirst({ where: { isDefault: true } });

    const nodo = await prisma.structureNode.create({
      data: {
        nombre: String(nombre).trim(),
        telefono: telefono || null,
        email: email || null,
        rol,
        nivel: levelOf(rol),
        parentId: parentId || null,
        territoryId: territoryId || null,
        userId: userId || null,
        campaignId: campaign?.id || null,
        metaSimpatizantes: Number(metaSimpatizantes) || 0,
        path, depth,
        createdBy: req.user.username
      },
      include: { territory: true }
    });

    audit(req, 'CREATE', 'StructureNode', nodo.id, `${nodo.nombre} (${rol})`);
    res.status(201).json(nodo);
  } catch (error) {
    console.error('Error al crear nodo de estructura:', error);
    res.status(500).json({ error: 'Error al crear el nodo' });
  }
};

// ───────────────────────────────────────────────────────────────────────────
// PUT /api/structure/:id
// ───────────────────────────────────────────────────────────────────────────
const update = async (req, res) => {
  try {
    const existente = await prisma.structureNode.findUnique({ where: { id: req.params.id } });
    if (!existente) return res.status(404).json({ error: 'Nodo no encontrado' });

    const {
      nombre, telefono, email, rol, territoryId, userId, metaSimpatizantes,
      activo, parentId
    } = req.body;

    const data = {};
    if (nombre) data.nombre = String(nombre).trim();
    if (telefono !== undefined) data.telefono = telefono || null;
    if (email !== undefined) data.email = email || null;
    if (territoryId !== undefined) data.territoryId = territoryId || null;
    if (metaSimpatizantes !== undefined) data.metaSimpatizantes = Number(metaSimpatizantes) || 0;
    if (activo !== undefined) data.activo = Boolean(activo);

    if (rol) {
      if (levelOf(rol) <= req.user.level && req.user.level > 0) {
        return res.status(403).json({ error: 'No puedes asignar ese rol' });
      }
      data.rol = rol;
      data.nivel = levelOf(rol);
    }

    if (userId !== undefined) {
      if (userId) {
        const ocupado = await prisma.structureNode.findFirst({
          where: { userId, id: { not: req.params.id } }
        });
        if (ocupado) {
          return res.status(400).json({ error: 'Esa cuenta ya está ligada a otro nodo' });
        }
      }
      data.userId = userId || null;
    }

    // Mover de padre arrastra toda la rama: se hace aparte para no dejar
    // rutas materializadas inconsistentes.
    if (parentId !== undefined && parentId !== existente.parentId) {
      try {
        await reparent(req.params.id, parentId || null);
      } catch (err) {
        return res.status(400).json({ error: err.message });
      }
    }

    const actualizado = await prisma.structureNode.update({
      where: { id: req.params.id },
      data,
      include: { territory: true }
    });

    audit(req, 'UPDATE', 'StructureNode', actualizado.id, actualizado.nombre);
    res.json(actualizado);
  } catch (error) {
    console.error('Error al actualizar nodo:', error);
    res.status(500).json({ error: 'Error al actualizar el nodo' });
  }
};

// ───────────────────────────────────────────────────────────────────────────
// DELETE /api/structure/:id
// ───────────────────────────────────────────────────────────────────────────
const remove = async (req, res) => {
  try {
    const nodo = await prisma.structureNode.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { children: true, personas: true } } }
    });
    if (!nodo) return res.status(404).json({ error: 'Nodo no encontrado' });

    if (nodo._count.children > 0) {
      return res.status(400).json({
        error: `Este nodo tiene ${nodo._count.children} subordinado(s). Reasígnalos antes de eliminarlo.`
      });
    }

    // Las personas no se borran: quedan sin promotor para reasignarse.
    if (nodo._count.personas > 0) {
      await prisma.person.updateMany({
        where: { promotorId: nodo.id },
        data: { promotorId: null }
      });
    }

    await prisma.structureNode.delete({ where: { id: nodo.id } });
    audit(req, 'DELETE', 'StructureNode', nodo.id,
      `${nodo.nombre}; ${nodo._count.personas} persona(s) quedaron sin promotor`);
    res.json({
      message: 'Nodo eliminado',
      personasLiberadas: nodo._count.personas
    });
  } catch (error) {
    console.error('Error al eliminar nodo:', error);
    res.status(500).json({ error: 'Error al eliminar el nodo' });
  }
};

// ───────────────────────────────────────────────────────────────────────────
// POST /api/structure/:id/asignar — mover personas a este promotor
// ───────────────────────────────────────────────────────────────────────────
const asignarPersonas = async (req, res) => {
  try {
    const nodo = await prisma.structureNode.findUnique({ where: { id: req.params.id } });
    if (!nodo) return res.status(404).json({ error: 'Nodo no encontrado' });

    const { personIds, seccion } = req.body;
    let where = null;

    if (Array.isArray(personIds) && personIds.length) {
      where = { id: { in: personIds } };
    } else if (seccion) {
      // Asignar de golpe toda una sección es lo que se hace al armar la red.
      where = { seccion: String(seccion) };
    } else {
      return res.status(400).json({ error: 'Indica personIds o una sección' });
    }

    const resultado = await prisma.person.updateMany({ where, data: { promotorId: nodo.id } });
    audit(req, 'UPDATE', 'Person', nodo.id,
      `${resultado.count} persona(s) asignadas a ${nodo.nombre}`);
    res.json({ asignadas: resultado.count, promotor: nodo.nombre });
  } catch (error) {
    console.error('Error al asignar personas:', error);
    res.status(500).json({ error: 'Error al asignar personas' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// Metas
// ═══════════════════════════════════════════════════════════════════════════

const listGoals = async (req, res) => {
  try {
    const goals = await prisma.goal.findMany({
      where: req.user.campaignId ? { campaignId: req.user.campaignId } : {},
      include: {
        node: { select: { id: true, nombre: true, rol: true } },
        territory: { select: { id: true, name: true, type: true, code: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Avance real de cada meta contra el padrón.
    const conAvance = [];
    for (const g of goals) {
      let logrado = 0;
      const filtro = {};

      if (g.nodeId) {
        const rama = await descendantNodeIds(g.nodeId);
        filtro.promotorId = { in: rama };
      } else if (g.territoryId) {
        const { descendantTerritoryIds } = require('../services/scope');
        filtro.territoryId = { in: await descendantTerritoryIds(g.territoryId) };
      }

      if (g.desde || g.hasta) {
        filtro.createdAt = {};
        if (g.desde) filtro.createdAt.gte = g.desde;
        if (g.hasta) filtro.createdAt.lte = g.hasta;
      }

      if (g.tipo === 'COMPROMISOS') filtro.compromisoVoto = true;
      if (g.tipo === 'VERIFICADOS') filtro.verificado = true;

      logrado = await prisma.person.count({ where: filtro });

      conAvance.push({
        ...g,
        logrado,
        avance: g.target > 0 ? logrado / g.target : null,
        faltan: Math.max(0, g.target - logrado),
        semaforo: g.target === 0 ? 'sin-meta'
          : logrado / g.target >= 1 ? 'verde'
          : logrado / g.target >= 0.6 ? 'amarillo'
          : 'rojo'
      });
    }

    res.json(conAvance);
  } catch (error) {
    console.error('Error al listar metas:', error);
    res.status(500).json({ error: 'Error al obtener las metas' });
  }
};

const createGoal = async (req, res) => {
  try {
    const { tipo, target, nodeId, territoryId, desde, hasta, notas } = req.body;
    if (!nodeId && !territoryId) {
      return res.status(400).json({ error: 'La meta debe ir a un nodo o a un territorio' });
    }
    if (!target || Number(target) <= 0) {
      return res.status(400).json({ error: 'Indica una meta mayor que cero' });
    }

    const campaign = req.user.campaignId
      ? { id: req.user.campaignId }
      : await prisma.campaign.findFirst({ where: { isDefault: true } });

    const goal = await prisma.goal.create({
      data: {
        tipo: tipo || 'SIMPATIZANTES',
        target: Number(target),
        nodeId: nodeId || null,
        territoryId: territoryId || null,
        campaignId: campaign?.id || null,
        desde: desde ? new Date(desde) : null,
        hasta: hasta ? new Date(hasta) : null,
        notas: notas || null,
        createdBy: req.user.username
      },
      include: { node: true, territory: true }
    });

    audit(req, 'CREATE', 'Goal', goal.id, `${goal.tipo}: ${goal.target}`);
    res.status(201).json(goal);
  } catch (error) {
    console.error('Error al crear meta:', error);
    res.status(500).json({ error: 'Error al crear la meta' });
  }
};

const updateGoal = async (req, res) => {
  try {
    const { target, tipo, desde, hasta, notas } = req.body;
    const data = {};
    if (target !== undefined) data.target = Number(target);
    if (tipo) data.tipo = tipo;
    if (desde !== undefined) data.desde = desde ? new Date(desde) : null;
    if (hasta !== undefined) data.hasta = hasta ? new Date(hasta) : null;
    if (notas !== undefined) data.notas = notas || null;

    const goal = await prisma.goal.update({ where: { id: req.params.id }, data });
    audit(req, 'UPDATE', 'Goal', goal.id, `${goal.tipo}: ${goal.target}`);
    res.json(goal);
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar la meta' });
  }
};

const deleteGoal = async (req, res) => {
  try {
    await prisma.goal.delete({ where: { id: req.params.id } });
    audit(req, 'DELETE', 'Goal', req.params.id);
    res.json({ message: 'Meta eliminada' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar la meta' });
  }
};

module.exports = {
  tree, list, avance, huecos, create, update, remove, asignarPersonas,
  listGoals, createGoal, updateGoal, deleteGoal
};
