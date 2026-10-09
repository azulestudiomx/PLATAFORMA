const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/brigadeController');
const { authMiddleware, requireLevel } = require('../middlewares/authMiddleware');

// Cobertura y jornadas: consulta amplia, para que el brigadista vea la suya.
router.get('/cobertura', authMiddleware, requireLevel(5), ctrl.cobertura);

router.get('/shifts', authMiddleware, ctrl.listShifts);
router.post('/shifts', authMiddleware, requireLevel(4), ctrl.createShift);
router.get('/shifts/:id', authMiddleware, ctrl.getShift);
// El check-in lo hace quien está en campo, sin importar su nivel.
router.post('/shifts/:id/checkin', authMiddleware, ctrl.checkIn);
router.post('/shifts/:id/checkout', authMiddleware, ctrl.checkOut);

router.get('/visits', authMiddleware, ctrl.listVisits);
router.post('/visits', authMiddleware, ctrl.createVisit);

router.get('/', authMiddleware, ctrl.listBrigades);
router.post('/', authMiddleware, requireLevel(4), ctrl.createBrigade);
router.put('/:id', authMiddleware, requireLevel(4), ctrl.updateBrigade);
router.delete('/:id', authMiddleware, requireLevel(3), ctrl.deleteBrigade);

module.exports = router;
