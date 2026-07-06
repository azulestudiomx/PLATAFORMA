const prisma = require('../services/db');

// GET /api/audit?page=1&limit=50&entity=Person&username=campo&action=DELETE
const getAuditLog = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const skip = (page - 1) * limit;

    const where = {};
    if (req.query.entity) where.entity = req.query.entity;
    if (req.query.username) where.username = req.query.username;
    if (req.query.action) where.action = req.query.action;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.auditLog.count({ where })
    ]);

    res.json({ data: logs, total, page, pages: Math.ceil(total / limit) });
  } catch (error) {
    console.error('Error al obtener bitácora:', error);
    res.status(500).json({ error: 'Error al obtener bitácora' });
  }
};

module.exports = { getAuditLog };
