const express = require('express');
const router = express.Router();
const systemController = require('../controllers/systemController');
const { authMiddleware, requireLevel } = require('../middlewares/authMiddleware');

// Eventos (calendario)
router.get('/events', authMiddleware, systemController.getEvents);
router.post('/events', authMiddleware, systemController.createEvent);
router.put('/events/:id', authMiddleware, systemController.updateEvent);
router.delete('/events/:id', authMiddleware, systemController.deleteEvent);

// Agenda del candidato: ficha de contexto y registro de asistentes
router.get('/events/:id/ficha', authMiddleware, systemController.getEventFicha);
router.post('/events/:id/asistentes', authMiddleware, systemController.addEventAttendee);
router.delete('/events/:id/asistentes/:attendeeId', authMiddleware, systemController.deleteEventAttendee);

// Configuración
// GET queda público: el tema se carga antes del login y no trae datos sensibles.
router.get('/config', systemController.getConfig);
router.post('/config', authMiddleware, requireLevel(2), systemController.updateConfig);

module.exports = router;
