const prisma = require('../services/db');

// GET /api/stats/brigadas — productividad por capturista y avance por sección
const getBrigadas = async (req, res) => {
  try {
    const now = new Date();
    const hace7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const hace30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [users, reportsByUser, reports7ByUser, resueltosByUser, peopleByUser, people7ByUser] = await Promise.all([
      prisma.user.findMany({ select: { username: true, name: true, role: true } }),
      prisma.report.groupBy({ by: ['user'], _count: { _all: true } }),
      prisma.report.groupBy({ by: ['user'], _count: { _all: true }, where: { createdAt: { gte: hace7 } } }),
      prisma.report.groupBy({ by: ['user'], _count: { _all: true }, where: { status: 'Resuelto' } }),
      prisma.person.groupBy({ by: ['createdBy'], _count: { _all: true } }),
      prisma.person.groupBy({ by: ['createdBy'], _count: { _all: true }, where: { createdAt: { gte: hace7 } } })
    ]);

    const countMap = (rows, key) =>
      Object.fromEntries(rows.map(r => [r[key] ?? '(sin usuario)', r._count._all]));

    const repTotal = countMap(reportsByUser, 'user');
    const rep7 = countMap(reports7ByUser, 'user');
    const repResueltos = countMap(resueltosByUser, 'user');
    const perTotal = countMap(peopleByUser, 'createdBy');
    const per7 = countMap(people7ByUser, 'createdBy');

    // Unión de usuarios registrados + nombres que aparecen en los datos
    const usernames = new Set([
      ...users.map(u => u.username),
      ...Object.keys(repTotal),
      ...Object.keys(perTotal)
    ]);
    usernames.delete('(sin usuario)');

    const nameMap = Object.fromEntries(users.map(u => [u.username, u.name]));
    const roleMap = Object.fromEntries(users.map(u => [u.username, u.role]));

    const brigadistas = [...usernames].map(u => ({
      username: u,
      name: nameMap[u] || u,
      role: roleMap[u] || null,
      reportes: repTotal[u] || 0,
      reportes7dias: rep7[u] || 0,
      reportesResueltos: repResueltos[u] || 0,
      personas: perTotal[u] || 0,
      personas7dias: per7[u] || 0,
      capturas7dias: (rep7[u] || 0) + (per7[u] || 0)
    })).sort((a, b) => (b.reportes + b.personas) - (a.reportes + a.personas));

    // Avance por sección electoral (personas capturadas)
    const porSeccion = await prisma.person.groupBy({
      by: ['seccion'],
      _count: { _all: true },
      orderBy: { _count: { seccion: 'desc' } },
      take: 20
    });

    // Actividad diaria de los últimos 14 días (reportes + personas)
    const actividad = await prisma.$queryRaw`
      SELECT dia, SUM(reportes) as reportes, SUM(personas) as personas FROM (
        SELECT date(createdAt) as dia, COUNT(*) as reportes, 0 as personas
        FROM Report WHERE createdAt >= ${hace30.toISOString()} GROUP BY date(createdAt)
        UNION ALL
        SELECT date(createdAt) as dia, 0 as reportes, COUNT(*) as personas
        FROM Person WHERE createdAt >= ${hace30.toISOString()} GROUP BY date(createdAt)
      ) GROUP BY dia ORDER BY dia ASC
    `;

    const [totalReportes, totalPersonas, totalResueltos] = await Promise.all([
      prisma.report.count(),
      prisma.person.count(),
      prisma.report.count({ where: { status: 'Resuelto' } })
    ]);

    res.json({
      brigadistas,
      porSeccion: porSeccion.map(s => ({ seccion: s.seccion || 'Sin sección', personas: s._count._all })),
      actividad: actividad.map(a => ({
        dia: a.dia,
        reportes: Number(a.reportes),
        personas: Number(a.personas)
      })),
      totales: {
        reportes: totalReportes,
        personas: totalPersonas,
        resueltos: totalResueltos,
        pendientes: totalReportes - totalResueltos
      }
    });
  } catch (error) {
    console.error('Error en stats de brigadas:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas de brigadas' });
  }
};

module.exports = { getBrigadas };
