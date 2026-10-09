const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/qualityController');
const { authMiddleware, requireLevel } = require('../middlewares/authMiddleware');

// El control de calidad es una herramienta de dirección: mide a los propios
// capturistas, así que no lo ve quien está siendo medido.
router.get('/resumen', authMiddleware, requireLevel(3), ctrl.resumen);
router.get('/flags', authMiddleware, requireLevel(3), ctrl.listFlags);
router.get('/capturistas', authMiddleware, requireLevel(3), ctrl.capturistas);

router.post('/analizar', authMiddleware, requireLevel(2), ctrl.analizar);
router.put('/flags/:id', authMiddleware, requireLevel(3), ctrl.resolveFlag);
router.post('/flags/bulk', authMiddleware, requireLevel(2), ctrl.bulkResolve);

module.exports = router;
