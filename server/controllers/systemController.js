const prisma = require('../services/db');

// Person (Padrón)
const getPeople = async (req, res) => {
  try {
    const people = await prisma.person.findMany({ orderBy: { createdAt: 'desc' } });
    res.json(people);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener padrón' });
  }
};

const createPerson = async (req, res) => {
  try {
    const { id, _id, ...data } = req.body;
    const person = await prisma.person.create({ data });
    res.status(201).json(person);
  } catch (error) {
    if (error.code === 'P2002') return res.status(400).json({ error: 'La clave INE ya está registrada' });
    console.error('Backend Person Create Error:', error);
    res.status(500).json({ error: 'Error al registrar persona' });
  }
};

const updatePerson = async (req, res) => {
  try {
    const { id, _id, createdAt, updatedAt, ...data } = req.body;
    const updated = await prisma.person.update({ 
      where: { id: req.params.id }, 
      data 
    });
    res.json(updated);
  } catch (error) {
    if (error.code === 'P2002') return res.status(400).json({ error: 'La clave INE ya está registrada en otra persona' });
    console.error('Backend Person Update Error:', error);
    res.status(500).json({ error: 'Error al actualizar persona' });
  }
};

const deletePerson = async (req, res) => {
  try {
    await prisma.person.delete({ where: { id: req.params.id } });
    res.json({ message: 'Persona eliminada' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar persona' });
  }
};

// Events (Calendario)
const getEvents = async (req, res) => {
  try {
    const events = await prisma.event.findMany({ orderBy: { date: 'asc' } });
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener eventos' });
  }
};

const createEvent = async (req, res) => {
  try {
    const event = await prisma.event.create({ data: req.body });
    res.status(201).json(event);
  } catch (error) {
    res.status(500).json({ error: 'Error al crear evento' });
  }
};

const updateEvent = async (req, res) => {
  try {
    const updated = await prisma.event.update({
       where: { id: req.params.id },
       data: req.body
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar evento' });
  }
};

const deleteEvent = async (req, res) => {
  try {
    await prisma.event.delete({ where: { id: req.params.id } });
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
  getPeople, createPerson, updatePerson, deletePerson,
  getEvents, createEvent, updateEvent, deleteEvent,
  getConfig, updateConfig
};
