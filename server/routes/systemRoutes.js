const express = require('express');
const router = express.Router();
const systemController = require('../controllers/systemController');
const { authMiddleware, adminMiddleware } = require('../middlewares/authMiddleware');

// Personas (Padrón)
router.get('/people', authMiddleware, systemController.getPeople);
router.post('/people', authMiddleware, systemController.createPerson);
router.put('/people/:id', authMiddleware, systemController.updatePerson);
router.delete('/people/:id', authMiddleware, systemController.deletePerson);

// Eventos (Calendario)
router.get('/events', authMiddleware, systemController.getEvents);
router.post('/events', authMiddleware, systemController.createEvent);
router.put('/events/:id', authMiddleware, systemController.updateEvent);
router.delete('/events/:id', authMiddleware, systemController.deleteEvent);

// Configuración
// GET queda público: el tema/colores se cargan antes del login y no contiene datos sensibles
router.get('/config', systemController.getConfig);
router.post('/config', authMiddleware, adminMiddleware, systemController.updateConfig);

module.exports = router;
