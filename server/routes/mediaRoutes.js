const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/mediaController');
const { authMiddleware, requireLevel } = require('../middlewares/authMiddleware');

router.get('/stats', authMiddleware, requireLevel(2), ctrl.storageStats);
router.get('/', authMiddleware, ctrl.listForOwner);
router.post('/', authMiddleware, ctrl.upload);
router.get('/:id', authMiddleware, ctrl.serve);

module.exports = router;
