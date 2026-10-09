/**
 * config/roles.js
 * Jerarquía de roles de la campaña.
 *
 * El nivel numérico decide dos cosas: qué territorio alcanza a ver un usuario
 * y sobre quién puede mandar. Menor número = mayor autoridad.
 */

const ROLES = {
  SUPERADMIN: {
    level: 0,
    label: 'Administrador del sistema',
    scope: 'GLOBAL',
    description: 'Acceso total, incluida la configuración y las campañas.'
  },
  CANDIDATO: {
    level: 1,
    label: 'Candidato',
    scope: 'CAMPAIGN',
    description: 'Lectura total de su campaña y la sala de mando.'
  },
  COORD_GENERAL: {
    level: 2,
    label: 'Coordinador general',
    scope: 'CAMPAIGN',
    description: 'Opera toda la campaña: estructura, metas y brigadas.'
  },
  COORD_MUNICIPAL: {
    level: 3,
    label: 'Coordinador municipal o distrital',
    scope: 'TERRITORY',
    description: 'Solo su municipio o distrito.'
  },
  COORD_SECCIONAL: {
    level: 4,
    label: 'Coordinador seccional',
    scope: 'TERRITORY',
    description: 'Solo sus secciones asignadas.'
  },
  PROMOTOR: {
    level: 5,
    label: 'Promotor',
    scope: 'OWN_BRANCH',
    description: 'Solo las personas que él y su rama capturaron.'
  },
  CAPTURISTA: {
    level: 6,
    label: 'Capturista',
    scope: 'OWN',
    description: 'Solo lo que él mismo capturó.'
  },
  REPRESENTANTE: {
    level: 7,
    label: 'Representante de casilla',
    scope: 'CASILLA',
    description: 'Solo su casilla el día de la jornada.'
  }
};

// Roles antiguos que siguen apareciendo en tokens y en la base heredada.
const LEGACY_ALIASES = {
  ADMIN: 'SUPERADMIN',
  CAPTURIST: 'CAPTURISTA'
};

/** Devuelve el nombre canónico de un rol, resolviendo los alias antiguos. */
const canonical = (role) => {
  if (!role) return 'CAPTURISTA';
  const upper = String(role).toUpperCase();
  if (ROLES[upper]) return upper;
  if (LEGACY_ALIASES[upper]) return LEGACY_ALIASES[upper];
  return 'CAPTURISTA';
};

/** Nivel numérico de un rol. Desconocido = el más bajo. */
const levelOf = (role) => ROLES[canonical(role)]?.level ?? 6;

/** Alcance declarado del rol. */
const scopeOf = (role) => ROLES[canonical(role)]?.scope ?? 'OWN';

/** ¿Este rol alcanza el nivel mínimo pedido? (menor número = más autoridad) */
const hasLevel = (role, maxLevel) => levelOf(role) <= maxLevel;

/** ¿`actor` puede administrar a `target`? Solo hacia abajo, nunca en paralelo. */
const canManage = (actorRole, targetRole) => levelOf(actorRole) < levelOf(targetRole);

/** Roles que un actor puede asignar al crear o editar usuarios. */
const assignableRoles = (actorRole) => {
  const actorLevel = levelOf(actorRole);
  return Object.entries(ROLES)
    .filter(([, def]) => def.level > actorLevel)
    .map(([name, def]) => ({ name, ...def }));
};

/** ¿Puede ver la clave de elector completa y la foto de la credencial? */
const canSeeSensitive = (role) => levelOf(role) <= 2;

/** ¿Puede exportar listados masivos? */
const canExport = (role) => levelOf(role) <= 3;

const listRoles = () =>
  Object.entries(ROLES)
    .map(([name, def]) => ({ name, ...def }))
    .sort((a, b) => a.level - b.level);

module.exports = {
  ROLES, LEGACY_ALIASES, canonical, levelOf, scopeOf,
  hasLevel, canManage, assignableRoles, canSeeSensitive, canExport, listRoles
};
