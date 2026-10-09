const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const prisma = require('../services/db');
const { audit } = require('../services/auditService');
const {
  canonical, levelOf, canManage, assignableRoles, listRoles
} = require('../config/roles');
const { forgetSession } = require('../middlewares/authMiddleware');

const JWT_SECRET = process.env.JWT_SECRET;
const SESSION_DAYS = 7;
const MAX_FAILED = 8;
const LOCK_MINUTES = 15;

/** Forma pública de un usuario: nunca sale el hash de la contraseña. */
const publicUser = (u) => ({
  id: u.id,
  username: u.username,
  name: u.name,
  role: u.role,
  level: u.level,
  active: u.active,
  phone: u.phone,
  email: u.email,
  campaignId: u.campaignId,
  territoryId: u.territoryId,
  territory: u.territory
    ? { id: u.territory.id, name: u.territory.name, type: u.territory.type }
    : null,
  lastLoginAt: u.lastLoginAt,
  createdAt: u.createdAt
});

// ───────────────────────────────────────────────────────────────────────────
// POST /api/auth/login
// ───────────────────────────────────────────────────────────────────────────
const login = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
    }

    const user = await prisma.user.findUnique({
      where: { username },
      include: { territory: true }
    });

    // Mensaje idéntico exista o no el usuario: evita enumeración de cuentas.
    const genericError = { error: 'Usuario o contraseña incorrectos' };
    if (!user) return res.status(401).json(genericError);

    if (!user.active) {
      return res.status(403).json({ error: 'Esta cuenta está desactivada' });
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const mins = Math.ceil((user.lockedUntil - Date.now()) / 60000);
      return res.status(429).json({
        error: `Cuenta bloqueada por intentos fallidos. Intenta en ${mins} minuto(s).`
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      const failed = user.failedAttempts + 1;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedAttempts: failed,
          lockedUntil: failed >= MAX_FAILED
            ? new Date(Date.now() + LOCK_MINUTES * 60000)
            : null
        }
      });
      return res.status(401).json(genericError);
    }

    const role = canonical(user.role);
    const jti = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

    // La sesión queda registrada para poder revocarla desde el panel.
    await prisma.session.create({
      data: {
        jti,
        userId: user.id,
        userAgent: req.headers['user-agent']?.slice(0, 250) || null,
        ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || null,
        expiresAt
      }
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), failedAttempts: 0, lockedUntil: null }
    });

    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role,
        level: levelOf(role),
        name: user.name,
        campaignId: user.campaignId,
        territoryId: user.territoryId,
        jti
      },
      JWT_SECRET,
      { expiresIn: `${SESSION_DAYS}d` }
    );

    audit({ user: { username: user.username, role } }, 'LOGIN', 'User', user.id, user.username);

    res.json({
      message: 'Login exitoso',
      token,
      user: publicUser({ ...user, role })
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

// ───────────────────────────────────────────────────────────────────────────
// POST /api/auth/logout — revoca la sesión actual
// ───────────────────────────────────────────────────────────────────────────
const logout = async (req, res) => {
  try {
    if (req.user?.jti) {
      await prisma.session.updateMany({
        where: { jti: req.user.jti, revokedAt: null },
        data: { revokedAt: new Date(), revokedBy: req.user.username }
      });
      forgetSession(req.user.jti);
    }
    audit(req, 'LOGOUT', 'User', req.user?.id, req.user?.username);
    res.json({ message: 'Sesión cerrada' });
  } catch (error) {
    res.status(500).json({ error: 'Error al cerrar sesión' });
  }
};

// ───────────────────────────────────────────────────────────────────────────
// GET /api/auth/me — perfil y permisos del usuario en sesión
// ───────────────────────────────────────────────────────────────────────────
const me = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { territory: true }
    });
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({
      ...publicUser(user),
      canSeeSensitive: req.user.canSeeSensitive,
      canExport: req.user.canExport,
      assignableRoles: assignableRoles(user.role)
    });
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener el perfil' });
  }
};

// ───────────────────────────────────────────────────────────────────────────
// GET /api/auth/sessions — sesiones activas del usuario en sesión
// ───────────────────────────────────────────────────────────────────────────
const listSessions = async (req, res) => {
  try {
    const targetUserId = req.query.userId && req.user.level <= 2
      ? String(req.query.userId)
      : req.user.id;

    const sessions = await prisma.session.findMany({
      where: { userId: targetUserId },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    res.json(sessions.map(s => ({
      id: s.id,
      userAgent: s.userAgent,
      ip: s.ip,
      createdAt: s.createdAt,
      lastSeenAt: s.lastSeenAt,
      expiresAt: s.expiresAt,
      revokedAt: s.revokedAt,
      actual: s.jti === req.user.jti,
      activa: !s.revokedAt && s.expiresAt > new Date()
    })));
  } catch (error) {
    res.status(500).json({ error: 'Error al listar sesiones' });
  }
};

// ───────────────────────────────────────────────────────────────────────────
// DELETE /api/auth/sessions/:id — revoca una sesión (dispositivo perdido)
// ───────────────────────────────────────────────────────────────────────────
const revokeSession = async (req, res) => {
  try {
    const session = await prisma.session.findUnique({ where: { id: req.params.id } });
    if (!session) return res.status(404).json({ error: 'Sesión no encontrada' });

    // Solo el dueño de la sesión o un coordinador general puede revocarla.
    if (session.userId !== req.user.id && req.user.level > 2) {
      return res.status(403).json({ error: 'No puedes revocar esta sesión' });
    }

    await prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date(), revokedBy: req.user.username }
    });
    forgetSession(session.jti);
    audit(req, 'UPDATE', 'Session', session.id, 'sesión revocada');
    res.json({ message: 'Sesión revocada' });
  } catch (error) {
    res.status(500).json({ error: 'Error al revocar la sesión' });
  }
};

// ───────────────────────────────────────────────────────────────────────────
// POST /api/auth/register
// ───────────────────────────────────────────────────────────────────────────
const register = async (req, res) => {
  try {
    const { username, password, name, role, territoryId, phone, email } = req.body;

    if (typeof username !== 'string' || username.trim().length < 3) {
      return res.status(400).json({ error: 'El usuario debe tener al menos 3 caracteres' });
    }
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
    }

    const targetRole = canonical(role || 'CAPTURISTA');
    if (!canManage(req.user.role, targetRole)) {
      return res.status(403).json({
        error: 'No puedes crear un usuario con un rol igual o superior al tuyo'
      });
    }

    const existingUser = await prisma.user.findUnique({ where: { username } });
    if (existingUser) {
      return res.status(400).json({ error: 'Ese nombre de usuario ya existe' });
    }

    // Los coordinadores solo crean gente dentro de su propio territorio.
    let finalTerritoryId = territoryId || null;
    if (req.user.level > 2 && req.user.territoryId) {
      const { descendantTerritoryIds } = require('../services/scope');
      const allowed = await descendantTerritoryIds(req.user.territoryId);
      if (finalTerritoryId && !allowed.includes(finalTerritoryId)) {
        return res.status(403).json({ error: 'Ese territorio está fuera de tu alcance' });
      }
      finalTerritoryId = finalTerritoryId || req.user.territoryId;
    }

    const campaign = await prisma.campaign.findFirst({ where: { isDefault: true } });
    const hashed = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        username: username.trim(),
        password: hashed,
        name: name || username,
        role: targetRole,
        level: levelOf(targetRole),
        territoryId: finalTerritoryId,
        campaignId: req.user.campaignId || campaign?.id || null,
        phone: phone || null,
        email: email || null
      },
      include: { territory: true }
    });

    audit(req, 'CREATE', 'User', user.id, `${user.username} (${targetRole})`);
    res.status(201).json(publicUser(user));
  } catch (error) {
    console.error('Error al registrar usuario:', error);
    res.status(500).json({ error: 'Error al registrar usuario' });
  }
};

// ───────────────────────────────────────────────────────────────────────────
// GET /api/auth/users
// ───────────────────────────────────────────────────────────────────────────
const listUsers = async (req, res) => {
  try {
    // Un coordinador solo ve a su gente; nivel 2 o superior ve a todos.
    let where = {};
    if (req.user.level > 2 && req.user.territoryId) {
      const { descendantTerritoryIds } = require('../services/scope');
      const ids = await descendantTerritoryIds(req.user.territoryId);
      where = { territoryId: { in: ids } };
    }

    const users = await prisma.user.findMany({
      where,
      include: { territory: true },
      orderBy: [{ level: 'asc' }, { name: 'asc' }]
    });

    res.json(users.map(publicUser));
  } catch (error) {
    res.status(500).json({ error: 'Error al listar usuarios' });
  }
};

// ───────────────────────────────────────────────────────────────────────────
// PUT /api/auth/users/:id
// ───────────────────────────────────────────────────────────────────────────
const updateUser = async (req, res) => {
  try {
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });

    const isSelf = target.id === req.user.id;
    if (!isSelf && !canManage(req.user.role, target.role)) {
      return res.status(403).json({ error: 'No puedes modificar a este usuario' });
    }

    const { name, password, role, territoryId, phone, email, active } = req.body;
    const data = {};

    if (name) data.name = name;
    if (phone !== undefined) data.phone = phone || null;
    if (email !== undefined) data.email = email || null;

    if (password) {
      if (password.length < 8) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
      }
      data.password = await bcrypt.hash(password, 10);
      data.passwordChangedAt = new Date();
      // Cambiar la contraseña cierra todas las sesiones abiertas.
      await prisma.session.updateMany({
        where: { userId: target.id, revokedAt: null },
        data: { revokedAt: new Date(), revokedBy: req.user.username }
      });
    }

    if (role) {
      const targetRole = canonical(role);
      if (!canManage(req.user.role, targetRole)) {
        return res.status(403).json({ error: 'No puedes asignar ese rol' });
      }
      data.role = targetRole;
      data.level = levelOf(targetRole);
    }

    if (territoryId !== undefined) data.territoryId = territoryId || null;

    if (active !== undefined && !isSelf) {
      data.active = Boolean(active);
      if (!data.active) {
        await prisma.session.updateMany({
          where: { userId: target.id, revokedAt: null },
          data: { revokedAt: new Date(), revokedBy: req.user.username }
        });
      }
    }

    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data,
      include: { territory: true }
    });

    audit(req, 'UPDATE', 'User', updated.id, `${updated.username}: ${Object.keys(data).join(', ')}`);
    res.json(publicUser(updated));
  } catch (error) {
    console.error('Error al actualizar usuario:', error);
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
};

// ───────────────────────────────────────────────────────────────────────────
// DELETE /api/auth/users/:id — desactiva en lugar de borrar
// ───────────────────────────────────────────────────────────────────────────
const deleteUser = async (req, res) => {
  try {
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });

    if (target.id === req.user.id) {
      return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta' });
    }
    if (!canManage(req.user.role, target.role)) {
      return res.status(403).json({ error: 'No puedes eliminar a este usuario' });
    }

    // Baja lógica: se conserva la trazabilidad de lo que capturó.
    await prisma.user.update({
      where: { id: target.id },
      data: { active: false }
    });
    await prisma.session.updateMany({
      where: { userId: target.id, revokedAt: null },
      data: { revokedAt: new Date(), revokedBy: req.user.username }
    });

    audit(req, 'DELETE', 'User', target.id, `${target.username} desactivado`);
    res.json({ message: 'Usuario desactivado' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar usuario' });
  }
};

// ───────────────────────────────────────────────────────────────────────────
// GET /api/auth/roles — catálogo para los selectores de la interfaz
// ───────────────────────────────────────────────────────────────────────────
const getRoles = async (req, res) => {
  res.json({
    all: listRoles(),
    assignable: assignableRoles(req.user.role)
  });
};

module.exports = {
  login, logout, me, register, listUsers, updateUser, deleteUser,
  listSessions, revokeSession, getRoles
};
