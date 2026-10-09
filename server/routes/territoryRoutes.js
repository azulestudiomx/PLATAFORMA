const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/territoryController');
const { authMiddleware, requireLevel } = require('../middlewares/authMiddleware');

router.get('/tree', authMiddleware, ctrl.tree);
router.get('/', authMiddleware, ctrl.list);
router.get('/:id/avance', authMiddleware, ctrl.avance);
router.post('/seed', authMiddleware, requireLevel(0), ctrl.seed);

module.exports = router;
