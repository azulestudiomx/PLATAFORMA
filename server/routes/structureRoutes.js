const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/structureController');
const { authMiddleware, requireLevel } = require('../middlewares/authMiddleware');

// Consulta: de coordinador seccional hacia arriba
router.get('/tree', authMiddleware, requireLevel(5), ctrl.tree);
router.get('/huecos', authMiddleware, requireLevel(4), ctrl.huecos);

// Metas (antes de /:id para que no las capture como id)
router.get('/goals', authMiddleware, requireLevel(5), ctrl.listGoals);
router.post('/goals', authMiddleware, requireLevel(3), ctrl.createGoal);
router.put('/goals/:id', authMiddleware, requireLevel(3), ctrl.updateGoal);
router.delete('/goals/:id', authMiddleware, requireLevel(3), ctrl.deleteGoal);

router.get('/', authMiddleware, requireLevel(5), ctrl.list);
router.get('/:id/avance', authMiddleware, requireLevel(5), ctrl.avance);

// Edición de la red: de coordinador municipal hacia arriba
router.post('/', authMiddleware, requireLevel(3), ctrl.create);
router.put('/:id', authMiddleware, requireLevel(3), ctrl.update);
router.delete('/:id', authMiddleware, requireLevel(3), ctrl.remove);
router.post('/:id/asignar', authMiddleware, requireLevel(4), ctrl.asignarPersonas);

module.exports = router;
