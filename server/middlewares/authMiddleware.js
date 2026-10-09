/**
 * middlewares/authMiddleware.js
 * Autenticación con sesiones revocables y autorización por nivel jerárquico.
 *
 * El token ahora carga un `jti` que corresponde a una fila en Session. Si esa
 * fila se revoca (dispositivo perdido, baja de usuario), el token deja de
 * servir de inmediato en lugar de seguir vivo siete días.
 */

const jwt = require('jsonwebtoken');
const prisma = require('../services/db');
const { canonical, levelOf, hasLevel, canSeeSensitive, canExport } = require('../config/roles');

/** Cache corta de sesiones revocadas: evita una consulta por petición. */
const revokedCache = new Map();
const CACHE_TTL = 30_000;

const isRevoked = async (jti) => {
  const cached = revokedCache.get(jti);
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.revoked;

  const session = await prisma.session.findUnique({
    where: { jti },
    select: { revokedAt: true, expiresAt: true }
  });

  const revoked =
    !session ||
    Boolean(session.revokedAt) ||
    session.expiresAt.getTime() < Date.now();

  revokedCache.set(jti, { at: Date.now(), revoked });
  return revoked;
};

/** Invalida la entrada de cache de una sesión al revocarla. */
const forgetSession = (jti) => revokedCache.delete(jti);

const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No autorizado, no hay token' });

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Token inválido' });
  }

  // Tokens con sesión registrada: se comprueba que siga vigente.
  if (decoded.jti) {
    if (await isRevoked(decoded.jti)) {
      return res.status(401).json({ error: 'Sesión revocada. Inicia sesión de nuevo.' });
    }
  }

  const role = canonical(decoded.role);
  req.user = {
    ...decoded,
    role,
    level: levelOf(role),
    canSeeSensitive: canSeeSensitive(role),
    canExport: canExport(role)
  };
  req.ip4 = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip;
  next();
};

/**
 * Exige un nivel jerárquico mínimo.
 * requireLevel(2) deja pasar a SUPERADMIN, CANDIDATO y COORD_GENERAL.
 */
const requireLevel = (maxLevel) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: 'No autorizado' });
  if (!hasLevel(req.user.role, maxLevel)) {
    return res.status(403).json({ error: 'Tu rol no tiene acceso a esta sección' });
  }
  next();
};

/** Compatibilidad: el antiguo adminMiddleware equivale a nivel 2 o superior. */
const adminMiddleware = requireLevel(2);

/** Solo el administrador del sistema. */
const superAdminMiddleware = requireLevel(0);

/** Exige poder ver datos personales sensibles (credencial de elector). */
const requireSensitive = (req, res, next) => {
  if (!req.user?.canSeeSensitive) {
    return res.status(403).json({ error: 'Tu rol no puede consultar datos de la credencial' });
  }
  next();
};

module.exports = {
  authMiddleware,
  adminMiddleware,
  superAdminMiddleware,
  requireLevel,
  requireSensitive,
  forgetSession
};
