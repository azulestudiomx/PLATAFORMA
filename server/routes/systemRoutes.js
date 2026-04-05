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
router.get('/events', systemController.getEvents);
router.post('/events', systemController.createEvent);
router.put('/events/:id', systemController.updateEvent);
router.delete('/events/:id', systemController.deleteEvent);

// Configuración
router.get('/config', systemController.getConfig);
router.post('/config', systemController.updateConfig);

module.exports = router;
