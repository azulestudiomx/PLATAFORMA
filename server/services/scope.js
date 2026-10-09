/**
 * services/scope.js
 * Alcance territorial: traduce "quién eres" en "qué filas puedes ver".
 *
 * Antes cualquier ADMIN veía el estado completo y cualquier capturista veía
 * el padrón entero. Aquí se calcula, una sola vez por petición, el conjunto
 * de territorios que alcanza el usuario y se convierte en un filtro Prisma.
 */

const prisma = require('./db');
const { scopeOf, levelOf } = require('../config/roles');

/**
 * Todos los territorios que cuelgan del nodo del usuario, incluido él mismo.
 * Se resuelve con la ruta materializada, sin recursión.
 */
const descendantTerritoryIds = async (territoryId) => {
  if (!territoryId) return null;
  const root = await prisma.territory.findUnique({
    where: { id: territoryId },
    select: { id: true, path: true }
  });
  if (!root) return [territoryId];

  const prefix = root.path ? `${root.path}/${root.id}` : root.id;
  const descendants = await prisma.territory.findMany({
    where: { OR: [{ path: prefix }, { path: { startsWith: `${prefix}/` } }] },
    select: { id: true }
  });
  return [root.id, ...descendants.map(t => t.id)];
};

/**
 * Códigos de sección que alcanza el usuario. Los registros heredados guardan
 * la sección como texto suelto, así que hace falta el filtro por código además
 * del filtro por territoryId.
 */
const scopedSectionCodes = async (territoryId) => {
  const ids = await descendantTerritoryIds(territoryId);
  if (!ids) return null;
  const secciones = await prisma.territory.findMany({
    where: { id: { in: ids }, type: 'SECCION' },
    select: { code: true }
  });
  return secciones.map(s => s.code);
};

/**
 * Construye el filtro Prisma para el padrón según el usuario.
 * Devuelve `{}` cuando el usuario ve todo.
 */
const personScope = async (user) => {
  if (!user) return { id: 'ninguno' }; // sin sesión no se ve nada
  const scope = scopeOf(user.role);

  if (scope === 'GLOBAL') return {};

  if (scope === 'CAMPAIGN') {
    return user.campaignId ? { campaignId: user.campaignId } : {};
  }

  if (scope === 'TERRITORY') {
    if (!user.territoryId) return { id: 'ninguno' };
    const ids = await descendantTerritoryIds(user.territoryId);
    const codes = await scopedSectionCodes(user.territoryId);
    const or = [{ territoryId: { in: ids } }];
    if (codes && codes.length) or.push({ seccion: { in: codes } });
    return { OR: or };
  }

  if (scope === 'OWN_BRANCH') {
    const or = [{ createdBy: user.username }];

    // Toda la rama que cuelga de su nodo en la red de promoción.
    const { nodeOfUser, descendantNodeIds } = require('./structureService');
    const nodo = await nodeOfUser(user.id);
    if (nodo) {
      const rama = await descendantNodeIds(nodo.id);
      if (rama.length) or.push({ promotorId: { in: rama } });
    }

    if (user.territoryId) {
      const codes = await scopedSectionCodes(user.territoryId);
      if (codes && codes.length) or.push({ seccion: { in: codes } });
    }
    return { OR: or };
  }

  // OWN y CASILLA: solo lo capturado por el propio usuario
  return { createdBy: user.username };
};

/** Equivalente para reportes, que guardan al autor en `user`. */
const reportScope = async (user) => {
  if (!user) return { id: 'ninguno' };
  const scope = scopeOf(user.role);

  if (scope === 'GLOBAL') return {};
  if (scope === 'CAMPAIGN') return user.campaignId ? { campaignId: user.campaignId } : {};

  if (scope === 'TERRITORY') {
    if (!user.territoryId) return { id: 'ninguno' };
    const municipios = await scopedMunicipioNames(user.territoryId);
    const or = [{ user: user.username }, { assignedTo: user.username }];
    if (municipios.length) or.push({ municipio: { in: municipios } });
    return { OR: or };
  }

  return { OR: [{ user: user.username }, { assignedTo: user.username }] };
};

/** Nombres de municipio que alcanza el usuario (los reportes los guardan por nombre). */
const scopedMunicipioNames = async (territoryId) => {
  const ids = await descendantTerritoryIds(territoryId);
  if (!ids) return [];
  const munis = await prisma.territory.findMany({
    where: { id: { in: ids }, type: 'MUNICIPIO' },
    select: { name: true }
  });
  return munis.map(m => m.name);
};

/** Combina el filtro de alcance con los filtros que pidió la interfaz. */
const withScope = (scopeFilter, userFilter) => {
  const scopeKeys = Object.keys(scopeFilter || {});
  if (!scopeKeys.length) return userFilter || {};
  const userKeys = Object.keys(userFilter || {});
  if (!userKeys.length) return scopeFilter;
  return { AND: [scopeFilter, userFilter] };
};

/** ¿Puede el usuario tocar este registro concreto? */
const canTouchPerson = async (user, person) => {
  if (!user || !person) return false;
  if (levelOf(user.role) <= 2) return true;
  const filter = await personScope(user);
  const match = await prisma.person.findFirst({
    where: { AND: [{ id: person.id }, filter] },
    select: { id: true }
  });
  return Boolean(match);
};

module.exports = {
  descendantTerritoryIds, scopedSectionCodes, scopedMunicipioNames,
  personScope, reportScope, withScope, canTouchPerson
};
