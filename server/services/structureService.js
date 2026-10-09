/**
 * services/structureService.js
 * Red de promoción: el árbol de responsables de la campaña.
 *
 * A diferencia del territorio (que es geografía fija), esta es la estructura
 * humana: quién responde por quién y por cuántos simpatizantes. Se resuelve
 * con ruta materializada para no recorrer el árbol en cada consulta.
 */

const prisma = require('./db');
const { levelOf } = require('../config/roles');

/** Recalcula path y depth de un nodo a partir de su padre. */
const rutaDe = async (parentId) => {
  if (!parentId) return { path: '', depth: 0 };
  const parent = await prisma.structureNode.findUnique({
    where: { id: parentId },
    select: { id: true, path: true, depth: true }
  });
  if (!parent) return { path: '', depth: 0 };
  return {
    path: parent.path ? `${parent.path}/${parent.id}` : parent.id,
    depth: parent.depth + 1
  };
};

/**
 * Todos los nodos que cuelgan de uno, incluido él mismo.
 * Es la operación central: define qué ve un promotor o un coordinador.
 */
const descendantNodeIds = async (nodeId) => {
  if (!nodeId) return [];
  const root = await prisma.structureNode.findUnique({
    where: { id: nodeId },
    select: { id: true, path: true }
  });
  if (!root) return [nodeId];

  const prefix = root.path ? `${root.path}/${root.id}` : root.id;
  const hijos = await prisma.structureNode.findMany({
    where: { OR: [{ path: prefix }, { path: { startsWith: `${prefix}/` } }] },
    select: { id: true }
  });
  return [root.id, ...hijos.map(n => n.id)];
};

/** Nodo de estructura asociado a una cuenta de usuario. */
const nodeOfUser = async (userId) => {
  if (!userId) return null;
  return prisma.structureNode.findUnique({ where: { userId } });
};

/**
 * Mueve un nodo bajo otro padre y arrastra a toda su rama.
 * Sin actualizar los descendientes, la ruta materializada queda mintiendo.
 */
const reparent = async (nodeId, nuevoParentId) => {
  const node = await prisma.structureNode.findUnique({ where: { id: nodeId } });
  if (!node) throw new Error('El nodo no existe');

  if (nuevoParentId) {
    // Un nodo no puede colgar de su propia rama: crearía un ciclo.
    const rama = await descendantNodeIds(nodeId);
    if (rama.includes(nuevoParentId)) {
      throw new Error('No puedes mover un nodo dentro de su propia rama');
    }
  }

  const { path, depth } = await rutaDe(nuevoParentId);
  const rutaVieja = node.path ? `${node.path}/${node.id}` : node.id;
  const rutaNueva = path ? `${path}/${node.id}` : node.id;

  const actualizado = await prisma.structureNode.update({
    where: { id: nodeId },
    data: { parentId: nuevoParentId || null, path, depth }
  });

  // Reescribir la ruta de cada descendiente conservando su profundidad relativa.
  const descendientes = await prisma.structureNode.findMany({
    where: { OR: [{ path: rutaVieja }, { path: { startsWith: `${rutaVieja}/` } }] },
    select: { id: true, path: true, depth: true }
  });

  for (const d of descendientes) {
    const nueva = rutaNueva + d.path.slice(rutaVieja.length);
    await prisma.structureNode.update({
      where: { id: d.id },
      data: { path: nueva, depth: nueva.split('/').filter(Boolean).length }
    });
  }

  return actualizado;
};

/**
 * Avance de un nodo y de toda su rama: cuántos simpatizantes lleva contra
 * su meta, cuántos comprometieron su voto y cuántos están verificados.
 */
const avanceDeNodo = async (nodeId) => {
  const node = await prisma.structureNode.findUnique({
    where: { id: nodeId },
    include: { territory: { select: { id: true, name: true, type: true } } }
  });
  if (!node) return null;

  const rama = await descendantNodeIds(nodeId);

  const [personas, compromisos, verificados, metaRama, multiplicador] = await Promise.all([
    prisma.person.count({ where: { promotorId: { in: rama } } }),
    prisma.person.count({ where: { promotorId: { in: rama }, compromisoVoto: true } }),
    prisma.person.count({ where: { promotorId: { in: rama }, verificado: true } }),
    prisma.structureNode.aggregate({
      where: { id: { in: rama }, activo: true },
      _sum: { metaSimpatizantes: true }
    }),
    prisma.person.aggregate({
      where: { promotorId: { in: rama } },
      _sum: { multiplicador: true }
    })
  ]);

  // La meta de la rama es la suma de las metas individuales; si nadie la
  // fijó, se usa la del propio nodo para no dividir entre cero.
  const meta = metaRama._sum.metaSimpatizantes || node.metaSimpatizantes || 0;

  return {
    nodeId: node.id,
    nombre: node.nombre,
    rol: node.rol,
    territorio: node.territory,
    integrantesRama: rama.length,
    personas,
    compromisos,
    verificados,
    // Alcance potencial: cada simpatizante más los que se comprometió a llevar.
    alcancePotencial: personas + (multiplicador._sum.multiplicador || 0),
    meta,
    avance: meta > 0 ? personas / meta : null,
    faltan: Math.max(0, meta - personas),
    tasaVerificacion: personas > 0 ? verificados / personas : null,
    tasaCompromiso: personas > 0 ? compromisos / personas : null
  };
};

/** Árbol completo con el avance de cada nodo, listo para pintar. */
const arbolConAvance = async ({ rootId = null, campaignId = null } = {}) => {
  const where = { activo: true };
  if (campaignId) where.campaignId = campaignId;

  const nodos = await prisma.structureNode.findMany({
    where,
    include: {
      territory: { select: { id: true, name: true, type: true, code: true } },
      user: { select: { id: true, username: true, active: true } },
      _count: { select: { personas: true, children: true } }
    },
    orderBy: [{ depth: 'asc' }, { nombre: 'asc' }]
  });

  // Personas por promotor en una sola consulta, en vez de una por nodo.
  const conteos = await prisma.person.groupBy({
    by: ['promotorId'],
    _count: { _all: true },
    where: { promotorId: { not: null } }
  });
  const directas = Object.fromEntries(
    conteos.map(c => [c.promotorId, c._count._all])
  );

  const byId = new Map(
    nodos.map(n => [n.id, {
      ...n,
      personasDirectas: directas[n.id] || 0,
      personasRama: 0,
      metaRama: n.metaSimpatizantes || 0,
      children: []
    }])
  );

  // Acumular hacia arriba: cada nodo suma lo suyo y lo de sus descendientes.
  // Se recorre de mayor profundidad a menor para que los hijos ya estén listos.
  const ordenados = [...byId.values()].sort((a, b) => b.depth - a.depth);
  for (const nodo of ordenados) {
    nodo.personasRama += nodo.personasDirectas;
    if (nodo.parentId && byId.has(nodo.parentId)) {
      const padre = byId.get(nodo.parentId);
      padre.personasRama += nodo.personasRama;
      padre.metaRama += nodo.metaRama;
    }
  }

  for (const nodo of byId.values()) {
    nodo.avance = nodo.metaRama > 0 ? nodo.personasRama / nodo.metaRama : null;
    const padre = nodo.parentId ? byId.get(nodo.parentId) : null;
    if (padre) padre.children.push(nodo);
  }

  const raices = [...byId.values()].filter(n => !n.parentId || !byId.has(n.parentId));
  if (rootId) {
    const raiz = byId.get(rootId);
    return raiz ? [raiz] : [];
  }
  return raices;
};

/** Huecos de estructura: territorios sin nadie que responda por ellos. */
const huecosDeEstructura = async ({ tipo = 'SECCION', limit = 50 } = {}) => {
  const territorios = await prisma.territory.findMany({
    where: { type: tipo },
    select: { id: true, name: true, code: true, listaNominal: true },
    orderBy: { listaNominal: 'desc' }
  });

  const conNodo = await prisma.structureNode.findMany({
    where: { activo: true, territoryId: { not: null } },
    select: { territoryId: true }
  });
  const cubiertos = new Set(conNodo.map(n => n.territoryId));

  return territorios
    .filter(t => !cubiertos.has(t.id))
    .slice(0, limit)
    .map(t => ({ ...t, motivo: 'Sin responsable asignado' }));
};

module.exports = {
  rutaDe, descendantNodeIds, nodeOfUser, reparent,
  avanceDeNodo, arbolConAvance, huecosDeEstructura
};
