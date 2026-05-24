const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/authMiddleware');
const ctrl = require('../controllers/electoralController');

// Todas las rutas electorales requieren autenticación
router.get('/resumen',          authMiddleware, ctrl.getResumen);
router.get('/secciones',        authMiddleware, ctrl.getSecciones);
router.get('/demografia/:seccion', authMiddleware, ctrl.getDemografia);
router.post('/meta',            authMiddleware, ctrl.calcularMetaEndpoint);
router.post('/ai-consult',      authMiddleware, ctrl.aiConsult);

module.exports = router;
