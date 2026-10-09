const prisma = require('../services/db');
const { audit } = require('../services/auditService');

// Events (Calendario)
const getEvents = async (req, res) => {
  try {
    const events = await prisma.event.findMany({ orderBy: { date: 'asc' } });
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener eventos' });
  }
};

const EVENT_FIELDS = [
  'title','date','location','community','type','description','assignedTo',
  'lat','lng','territoryId','aforoEsperado','aforoReal','costo',
  'responsableAvanzada','contactoLocal','telefonoLocal','estado'
];

const pickEvent = (body) => {
  const out = {};
  for (const f of EVENT_FIELDS) if (f in body) out[f] = body[f];
  if (out.aforoEsperado != null) out.aforoEsperado = Number(out.aforoEsperado) || null;
  if (out.aforoReal != null) out.aforoReal = Number(out.aforoReal) || null;
  if (out.costo != null && out.costo !== '') out.costo = String(out.costo); else delete out.costo;
  return out;
};

const createEvent = async (req, res) => {
  try {
    const data = pickEvent(req.body);
    const event = await prisma.event.create({
      data: { ...data, createdBy: req.user?.username || null }
    });
    audit(req, 'CREATE', 'Event', event.id, event.title);
    res.status(201).json(event);
  } catch (error) {
    res.status(500).json({ error: 'Error al crear evento' });
  }
};

const updateEvent = async (req, res) => {
  try {
    const data = pickEvent(req.body);
    const updated = await prisma.event.update({
       where: { id: req.params.id },
       data
    });
    audit(req, 'UPDATE', 'Event', updated.id, updated.title);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar evento' });
  }
};

const deleteEvent = async (req, res) => {
  try {
    const event = await prisma.event.delete({ where: { id: req.params.id } });
    audit(req, 'DELETE', 'Event', req.params.id, event.title);
    res.json({ message: 'Evento eliminado' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar evento' });
  }
};

// Configuración
const getConfig = async (req, res) => {
  try {
    let config = await prisma.systemConfig.findFirst();
    if (!config) {
      config = await prisma.systemConfig.create({ data: {} });
    }
    // Parse JSON strings back to arrays/objects for frontend
    res.json({
      theme: { primary: config.primaryColor, secondary: config.secondaryCol, accent: config.accentColor },
      needTypes: JSON.parse(config.needTypes),
      eventTypes: JSON.parse(config.eventTypes || '[]'),
      customFields: JSON.parse(config.customFields)
    });
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener configuración' });
  }
};

const updateConfig = async (req, res) => {
  try {
    let config = await prisma.systemConfig.findFirst();
    const dataToUpdate = {};
    if (req.body.theme) {
      if (req.body.theme.primary) dataToUpdate.primaryColor = req.body.theme.primary;
      if (req.body.theme.secondary) dataToUpdate.secondaryCol = req.body.theme.secondary;
      if (req.body.theme.accent) dataToUpdate.accentColor = req.body.theme.accent;
    }
    if (req.body.needTypes) dataToUpdate.needTypes = JSON.stringify(req.body.needTypes);
    if (req.body.eventTypes) dataToUpdate.eventTypes = JSON.stringify(req.body.eventTypes);
    if (req.body.customFields) dataToUpdate.customFields = JSON.stringify(req.body.customFields);

    if (config) {
      config = await prisma.systemConfig.update({ where: { id: config.id }, data: dataToUpdate });
    } else {
      config = await prisma.systemConfig.create({ data: dataToUpdate });
    }
    audit(req, 'UPDATE', 'SystemConfig', config.id, Object.keys(dataToUpdate).join(', '));

    res.json({
      theme: { primary: config.primaryColor, secondary: config.secondaryCol, accent: config.accentColor },
      needTypes: JSON.parse(config.needTypes),
      eventTypes: JSON.parse(config.eventTypes || '[]'),
      customFields: JSON.parse(config.customFields)
    });
  } catch (error) {
    res.status(500).json({ error: 'Error al guardar configuración' });
  }
};

module.exports = {
  getEvents, createEvent, updateEvent, deleteEvent,
  getConfig, updateConfig
};

// ═══════════════════════════════════════════════════════════════════════════
// Agenda del candidato (Fase 3)
// ═══════════════════════════════════════════════════════════════════════════

const { findSeccion } = require('../services/territoryService');

/**
 * GET /api/events/:id/ficha
 * Todo lo que hace falta saber antes de pisar un evento: histórico electoral
 * de la sección, gestiones pendientes y quién es líder local ahí.
 */
const getEventFicha = async (req, res) => {
  try {
    const evento = await prisma.event.findUnique({
      where: { id: req.params.id },
      include: {
        territory: true,
        asistentes: { orderBy: { createdAt: 'desc' } },
        _count: { select: { asistentes: true } },
      },
    });
    if (!evento) return res.status(404).json({ error: 'Evento no encontrado' });

    const t = evento.territory;
    let contexto = null;

    if (t) {
      const [padron, lideres, pendientes] = await Promise.all([
        prisma.person.count({ where: { territoryId: t.id } }),
        prisma.person.findMany({
          where: { territoryId: t.id, esLider: true },
          select: { id: true, name: true, phone: true },
          take: 10,
        }),
        prisma.report.count({
          where: {
            municipio: evento.community || undefined,
            status: { not: 'Resuelto' },
          },
        }),
      ]);

      contexto = {
        territorio: { id: t.id, nombre: t.name, code: t.code, tipo: t.type },
        listaNominal: t.listaNominal,
        padronPropio: padron,
        cobertura: t.listaNominal > 0 ? padron / t.listaNominal : null,
        lideresLocales: lideres,
        gestionesPendientes: pendientes,
      };
    }

    res.json({
      ...evento,
      asistentesRegistrados: evento._count.asistentes,
      // Un evento con 300 asistentes que no deja nombres no sirve de nada:
      // esta cifra es la que mide si el evento aportó al padrón.
      cumplimientoAforo: evento.aforoEsperado > 0
        ? (evento.aforoReal ?? evento._count.asistentes) / evento.aforoEsperado
        : null,
      costoPorAsistente: evento.costo && evento._count.asistentes > 0
        ? Number(evento.costo) / evento._count.asistentes
        : null,
      contexto,
    });
  } catch (error) {
    console.error('Error al obtener la ficha del evento:', error);
    res.status(500).json({ error: 'Error al obtener la ficha del evento' });
  }
};

/** POST /api/events/:id/asistentes — registro en la puerta */
const addEventAttendee = async (req, res) => {
  try {
    const { nombre, telefono, personId, estado } = req.body;
    if (!nombre?.trim() && !personId) {
      return res.status(400).json({ error: 'Indica el nombre o elige a alguien del padrón' });
    }

    const evento = await prisma.event.findUnique({ where: { id: req.params.id } });
    if (!evento) return res.status(404).json({ error: 'Evento no encontrado' });

    let nombreFinal = nombre?.trim();
    if (personId && !nombreFinal) {
      const p = await prisma.person.findUnique({ where: { id: personId } });
      nombreFinal = p?.name || 'Asistente';
    }

    const asistente = await prisma.eventAttendee.create({
      data: {
        eventId: evento.id,
        personId: personId || null,
        nombre: nombreFinal,
        telefono: telefono || null,
        estado: estado || 'ASISTIO',
        registradoPor: req.user?.username || null,
      },
    });

    // El aforo real se mantiene al día con cada registro en la puerta.
    const total = await prisma.eventAttendee.count({ where: { eventId: evento.id } });
    await prisma.event.update({ where: { id: evento.id }, data: { aforoReal: total } });

    res.status(201).json({ ...asistente, aforoReal: total });
  } catch (error) {
    console.error('Error al registrar asistente:', error);
    res.status(500).json({ error: 'Error al registrar al asistente' });
  }
};

const deleteEventAttendee = async (req, res) => {
  try {
    const a = await prisma.eventAttendee.delete({ where: { id: req.params.attendeeId } });
    const total = await prisma.eventAttendee.count({ where: { eventId: a.eventId } });
    await prisma.event.update({ where: { id: a.eventId }, data: { aforoReal: total } });
    res.json({ message: 'Asistente eliminado', aforoReal: total });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar al asistente' });
  }
};

module.exports.getEventFicha = getEventFicha;
module.exports.addEventAttendee = addEventAttendee;
module.exports.deleteEventAttendee = deleteEventAttendee;
