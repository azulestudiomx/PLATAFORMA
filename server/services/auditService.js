const prisma = require('./db');

/**
 * Registra una acción en la bitácora de auditoría.
 * Fire-and-forget: nunca bloquea ni rompe la petición principal.
 */
const audit = (req, action, entity, entityId, detail) => {
  prisma.auditLog
    .create({
      data: {
        username: req.user?.username || null,
        role: req.user?.role || null,
        action,
        entity,
        entityId: entityId ? String(entityId) : null,
        detail: detail || null
      }
    })
    .catch(err => console.error('Error al registrar auditoría:', err.message));
};

module.exports = { audit };
