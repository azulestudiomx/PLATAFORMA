/**
 * controllers/brigadeController.js
 * Brigadas, jornadas de campo y visitas a domicilio.
 *
 * La jornada comprueba con GPS que la entrada ocurrió dentro del territorio
 * asignado. Y cada visita queda registrada aunque no haya nadie en casa: los
 * "no estaba" son justo lo que evita que la siguiente brigada repita la puerta.
 */

const prisma = require('../services/db');
const { audit } = require('../services/auditService');
const { dentroDeTerritorio, distanciaKm } = require('../services/geo');
const { saveImage } = require('../services/storage');
const { findSeccion } = require('../services/territoryService');

// ═══════════════════════════════════════════════════════════════════════════
// Brigadas
// ═══════════════════════════════════════════════════════════════════════════

const listBrigades = async (req, res) => {
  try {
    const { activa, territoryId } = req.query;
    const where = {};
    if (activa !== undefined) where.activa = activa === 'true';
    if (territoryId) where.territoryId = String(territoryId);

    const brigadas = await prisma.brigade.findMany({
      where,
      include: {
        territory: { select: { id: true, name: true, code: true, type: true } },
        jefe: { select: { id: true, nombre: true } },
        integrantes: true,
        _count: { select: { jornadas: true, visitas: true } },
      },
      orderBy: { nombre: 'asc' },
    });

    // Última jornada de cada brigada: es lo que dice si sigue activa de verdad.
    const conUltima = await Promise.all(brigadas.map(async b => {
      const ultima = await prisma.brigadeShift.findFirst({
        where: { brigadeId: b.id },
        orderBy: { fecha: 'desc' },
        select: { id: true, fecha: true, estado: true, dentroDeZona: true },
      });
      return { ...b, ultimaJornada: ultima };
    }));

    res.json(conUltima);
  } catch (error) {
    console.error('Error al listar brigadas:', error);
    res.status(500).json({ error: 'Error al listar las brigadas' });
  }
};

const createBrigade = async (req, res) => {
  try {
    const { nombre, vehiculo, jefeId, territoryId, integrantes } = req.body;
    if (!nombre?.trim()) return res.status(400).json({ error: 'El nombre es obligatorio' });

    const campaign = req.user.campaignId
      ? { id: req.user.campaignId }
      : await prisma.campaign.findFirst({ where: { isDefault: true } });

    const brigada = await prisma.brigade.create({
      data: {
        nombre: nombre.trim(),
        vehiculo: vehiculo || null,
        jefeId: jefeId || null,
        territoryId: territoryId || null,
        campaignId: campaign?.id || null,
        createdBy: req.user.username,
        integrantes: Array.isArray(integrantes) && integrantes.length
          ? {
              create: integrantes.map(i => ({
                nombre: i.nombre,
                userId: i.userId || null,
                rol: i.rol || 'BRIGADISTA',
              })),
            }
          : undefined,
      },
      include: { integrantes: true, territory: true },
    });

    audit(req, 'CREATE', 'Brigade', brigada.id, brigada.nombre);
    res.status(201).json(brigada);
  } catch (error) {
    console.error('Error al crear brigada:', error);
    res.status(500).json({ error: 'Error al crear la brigada' });
  }
};

const updateBrigade = async (req, res) => {
  try {
    const { nombre, vehiculo, jefeId, territoryId, activa, integrantes } = req.body;
    const data = {};
    if (nombre) data.nombre = nombre.trim();
    if (vehiculo !== undefined) data.vehiculo = vehiculo || null;
    if (jefeId !== undefined) data.jefeId = jefeId || null;
    if (territoryId !== undefined) data.territoryId = territoryId || null;
    if (activa !== undefined) data.activa = Boolean(activa);

    // Los integrantes se reemplazan por completo: es más simple de razonar
    // que un diff parcial, y la lista siempre es corta.
    if (Array.isArray(integrantes)) {
      await prisma.brigadeMember.deleteMany({ where: { brigadeId: req.params.id } });
      data.integrantes = {
        create: integrantes.map(i => ({
          nombre: i.nombre,
          userId: i.userId || null,
          rol: i.rol || 'BRIGADISTA',
        })),
      };
    }

    const brigada = await prisma.brigade.update({
      where: { id: req.params.id },
      data,
      include: { integrantes: true, territory: true },
    });

    audit(req, 'UPDATE', 'Brigade', brigada.id, brigada.nombre);
    res.json(brigada);
  } catch (error) {
    console.error('Error al actualizar brigada:', error);
    res.status(500).json({ error: 'Error al actualizar la brigada' });
  }
};

const deleteBrigade = async (req, res) => {
  try {
    const b = await prisma.brigade.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { jornadas: true } } },
    });
    if (!b) return res.status(404).json({ error: 'Brigada no encontrada' });

    // Con historial de campo, se desactiva en lugar de borrar: esas jornadas
    // son evidencia del trabajo hecho.
    if (b._count.jornadas > 0) {
      await prisma.brigade.update({ where: { id: b.id }, data: { activa: false } });
      audit(req, 'UPDATE', 'Brigade', b.id, `${b.nombre} desactivada (tiene historial)`);
      return res.json({
        message: 'La brigada tiene jornadas registradas, así que se desactivó en lugar de borrarse.',
        desactivada: true,
      });
    }

    await prisma.brigade.delete({ where: { id: b.id } });
    audit(req, 'DELETE', 'Brigade', b.id, b.nombre);
    res.json({ message: 'Brigada eliminada' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar la brigada' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// Jornadas
// ═══════════════════════════════════════════════════════════════════════════

const listShifts = async (req, res) => {
  try {
    const { brigadeId, estado, desde, hasta } = req.query;
    const where = {};
    if (brigadeId) where.brigadeId = String(brigadeId);
    if (estado) where.estado = String(estado);
    if (desde || hasta) {
      where.fecha = {};
      if (desde) where.fecha.gte = new Date(desde);
      if (hasta) where.fecha.lte = new Date(`${hasta}T23:59:59.999Z`);
    }

    const jornadas = await prisma.brigadeShift.findMany({
      where,
      include: {
        brigade: { select: { id: true, nombre: true } },
        territory: { select: { id: true, name: true, code: true, type: true } },
        _count: { select: { visitas: true } },
      },
      orderBy: { fecha: 'desc' },
      take: 200,
    });

    res.json(jornadas.map(j => ({
      ...j,
      // Horas efectivas en campo: lo que separa una jornada real de un registro.
      horasEnCampo: j.checkInAt && j.checkOutAt
        ? Number(((j.checkOutAt - j.checkInAt) / 3600000).toFixed(1))
        : null,
    })));
  } catch (error) {
    console.error('Error al listar jornadas:', error);
    res.status(500).json({ error: 'Error al listar las jornadas' });
  }
};

const createShift = async (req, res) => {
  try {
    const { brigadeId, territoryId, fecha, metaVisitas, notas } = req.body;
    if (!brigadeId) return res.status(400).json({ error: 'Indica la brigada' });

    const brigada = await prisma.brigade.findUnique({ where: { id: brigadeId } });
    if (!brigada) return res.status(404).json({ error: 'Brigada no encontrada' });

    const jornada = await prisma.brigadeShift.create({
      data: {
        brigadeId,
        territoryId: territoryId || brigada.territoryId || null,
        fecha: fecha ? new Date(fecha) : new Date(),
        metaVisitas: Number(metaVisitas) || 0,
        notas: notas || null,
        createdBy: req.user.username,
      },
      include: { brigade: true, territory: true },
    });

    audit(req, 'CREATE', 'BrigadeShift', jornada.id, `Jornada de ${brigada.nombre}`);
    res.status(201).json(jornada);
  } catch (error) {
    console.error('Error al crear jornada:', error);
    res.status(500).json({ error: 'Error al crear la jornada' });
  }
};

/**
 * POST /api/brigades/shifts/:id/checkin
 * Registra la entrada y comprueba contra la geocerca del territorio.
 */
const checkIn = async (req, res) => {
  try {
    const { lat, lng } = req.body;
    const jornada = await prisma.brigadeShift.findUnique({
      where: { id: req.params.id },
      include: { territory: true, brigade: true },
    });
    if (!jornada) return res.status(404).json({ error: 'Jornada no encontrada' });
    if (jornada.checkInAt) {
      return res.status(400).json({ error: 'Esta jornada ya tiene entrada registrada' });
    }
    if (lat == null || lng == null) {
      return res.status(400).json({ error: 'Se necesita la ubicación para registrar la entrada' });
    }

    const geo = dentroDeTerritorio(Number(lat), Number(lng), jornada.territory);

    const actualizada = await prisma.brigadeShift.update({
      where: { id: jornada.id },
      data: {
        checkInAt: new Date(),
        checkInLat: Number(lat),
        checkInLng: Number(lng),
        checkInKm: geo.km,
        dentroDeZona: geo.dentro,
        estado: 'EN_CURSO',
      },
      include: { brigade: true, territory: true },
    });

    audit(req, 'UPDATE', 'BrigadeShift', jornada.id,
      `Entrada de ${jornada.brigade.nombre}${geo.dentro ? '' : ' — FUERA DE ZONA'}`);

    res.json({
      ...actualizada,
      geocerca: geo,
      // Fuera de zona no bloquea: puede ser GPS impreciso o un territorio mal
      // asignado. Se registra y se avisa, y que lo revise un coordinador.
      aviso: geo.dentro ? null : geo.motivo,
    });
  } catch (error) {
    console.error('Error en check-in:', error);
    res.status(500).json({ error: 'Error al registrar la entrada' });
  }
};

const checkOut = async (req, res) => {
  try {
    const { lat, lng, resumen } = req.body;
    const jornada = await prisma.brigadeShift.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { visitas: true } } },
    });
    if (!jornada) return res.status(404).json({ error: 'Jornada no encontrada' });
    if (!jornada.checkInAt) {
      return res.status(400).json({ error: 'Esta jornada no tiene entrada registrada' });
    }
    if (jornada.checkOutAt) {
      return res.status(400).json({ error: 'Esta jornada ya está cerrada' });
    }

    const actualizada = await prisma.brigadeShift.update({
      where: { id: jornada.id },
      data: {
        checkOutAt: new Date(),
        checkOutLat: lat != null ? Number(lat) : null,
        checkOutLng: lng != null ? Number(lng) : null,
        estado: 'CERRADA',
        resumen: resumen || null,
      },
    });

    const horas = ((actualizada.checkOutAt - actualizada.checkInAt) / 3600000).toFixed(1);
    audit(req, 'UPDATE', 'BrigadeShift', jornada.id,
      `Cierre de jornada: ${jornada._count.visitas} visitas en ${horas} h`);

    res.json({
      ...actualizada,
      horasEnCampo: Number(horas),
      visitas: jornada._count.visitas,
      cumplimientoMeta: jornada.metaVisitas > 0
        ? jornada._count.visitas / jornada.metaVisitas
        : null,
    });
  } catch (error) {
    console.error('Error en check-out:', error);
    res.status(500).json({ error: 'Error al cerrar la jornada' });
  }
};

const getShift = async (req, res) => {
  try {
    const jornada = await prisma.brigadeShift.findUnique({
      where: { id: req.params.id },
      include: {
        brigade: { include: { integrantes: true } },
        territory: true,
        visitas: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!jornada) return res.status(404).json({ error: 'Jornada no encontrada' });

    // Desglose de resultados: es lo que se lee en el cierre de jornada.
    const porResultado = {};
    for (const v of jornada.visitas) {
      porResultado[v.resultado] = (porResultado[v.resultado] || 0) + 1;
    }

    res.json({
      ...jornada,
      horasEnCampo: jornada.checkInAt && jornada.checkOutAt
        ? Number(((jornada.checkOutAt - jornada.checkInAt) / 3600000).toFixed(1))
        : null,
      porResultado,
      cumplimientoMeta: jornada.metaVisitas > 0
        ? jornada.visitas.length / jornada.metaVisitas
        : null,
    });
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener la jornada' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// Visitas
// ═══════════════════════════════════════════════════════════════════════════

const createVisit = async (req, res) => {
  try {
    const {
      shiftId, brigadeId, personId, direccion, lat, lng,
      resultado, notas, seccion, evidencia,
    } = req.body;

    if (!resultado) return res.status(400).json({ error: 'Indica el resultado de la visita' });

    const territory = seccion ? await findSeccion(seccion) : null;

    const visita = await prisma.visit.create({
      data: {
        shiftId: shiftId || null,
        brigadeId: brigadeId || null,
        personId: personId || null,
        direccion: direccion || null,
        lat: lat != null ? Number(lat) : null,
        lng: lng != null ? Number(lng) : null,
        territoryId: territory?.id || null,
        resultado,
        notas: notas || null,
        createdBy: req.user.username,
      },
    });

    if (evidencia) {
      const saved = await saveImage({
        data: evidencia, kind: 'REPORT_EVIDENCE',
        ownerType: 'Visit', ownerId: visita.id, uploadedBy: req.user.username,
      });
      if (saved) {
        await prisma.visit.update({
          where: { id: visita.id },
          data: { evidenciaUrl: saved.url },
        });
      }
    }

    // Una visita con contacto positivo actualiza la ficha de la persona:
    // el dato más reciente es el que vale.
    if (personId && resultado === 'CONTACTADO') {
      await prisma.person.update({
        where: { id: personId },
        data: { verificado: true, verificadoAt: new Date(), verificadoPor: req.user.username },
      }).catch(() => { /* la persona pudo borrarse entre tanto */ });
    }

    res.status(201).json(visita);
  } catch (error) {
    console.error('Error al registrar visita:', error);
    res.status(500).json({ error: 'Error al registrar la visita' });
  }
};

const listVisits = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, parseInt(req.query.limit, 10) || 50);
    const { shiftId, brigadeId, resultado, seccion } = req.query;

    const where = {};
    if (shiftId) where.shiftId = String(shiftId);
    if (brigadeId) where.brigadeId = String(brigadeId);
    if (resultado) where.resultado = String(resultado);
    if (seccion) {
      const t = await findSeccion(seccion);
      if (t) where.territoryId = t.id;
    }

    const [total, data] = await Promise.all([
      prisma.visit.count({ where }),
      prisma.visit.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          person: { select: { id: true, name: true } },
          brigade: { select: { id: true, nombre: true } },
          territory: { select: { id: true, name: true, code: true } },
        },
      }),
    ]);

    res.json({ data, total, page, limit, pages: Math.ceil(total / limit) || 1 });
  } catch (error) {
    res.status(500).json({ error: 'Error al listar las visitas' });
  }
};

/**
 * GET /api/brigades/cobertura
 * Qué tanto se ha recorrido cada sección: visitas contra lista nominal.
 */
const cobertura = async (req, res) => {
  try {
    const porTerritorio = await prisma.visit.groupBy({
      by: ['territoryId'],
      where: { territoryId: { not: null } },
      _count: { _all: true },
    });

    const ids = porTerritorio.map(v => v.territoryId);
    const territorios = await prisma.territory.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, code: true, listaNominal: true, tipoSeccion: true },
    });
    const mapa = Object.fromEntries(territorios.map(t => [t.id, t]));

    // Contactos efectivos aparte del total: tocar la puerta no es contactar.
    const contactados = await prisma.visit.groupBy({
      by: ['territoryId'],
      where: { territoryId: { not: null }, resultado: 'CONTACTADO' },
      _count: { _all: true },
    });
    const mapaContacto = Object.fromEntries(
      contactados.map(c => [c.territoryId, c._count._all])
    );

    const salida = porTerritorio
      .map(v => {
        const t = mapa[v.territoryId];
        if (!t) return null;
        const visitas = v._count._all;
        const efectivos = mapaContacto[v.territoryId] || 0;
        return {
          territoryId: t.id,
          seccion: t.code,
          nombre: t.name,
          tipoSeccion: t.tipoSeccion,
          listaNominal: t.listaNominal,
          visitas,
          contactados: efectivos,
          tasaContacto: visitas > 0 ? efectivos / visitas : null,
          cobertura: t.listaNominal > 0 ? visitas / t.listaNominal : null,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.visitas - a.visitas);

    res.json(salida);
  } catch (error) {
    console.error('Error al calcular cobertura:', error);
    res.status(500).json({ error: 'Error al calcular la cobertura' });
  }
};

module.exports = {
  listBrigades, createBrigade, updateBrigade, deleteBrigade,
  listShifts, createShift, getShift, checkIn, checkOut,
  createVisit, listVisits, cobertura,
};
