const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/peopleController');
const { authMiddleware } = require('../middlewares/authMiddleware');

// Las rutas específicas van antes que /:id para que no las capture.
router.get('/stats', authMiddleware, ctrl.getPeopleStats);
router.get('/map', authMiddleware, ctrl.getPeopleMap);
router.post('/bulk', authMiddleware, ctrl.bulkUpsert);

router.get('/', authMiddleware, ctrl.getPeople);
router.post('/', authMiddleware, ctrl.createPerson);
router.get('/:id', authMiddleware, ctrl.getPersonById);
router.put('/:id', authMiddleware, ctrl.updatePerson);
router.delete('/:id', authMiddleware, ctrl.deletePerson);

module.exports = router;
