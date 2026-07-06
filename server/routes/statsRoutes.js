const express = require('express');
const router = express.Router();
const { authMiddleware, adminMiddleware } = require('../middlewares/authMiddleware');
const { getBrigadas } = require('../controllers/statsController');
const { getAuditLog } = require('../controllers/auditController');

router.get('/brigadas', authMiddleware, adminMiddleware, getBrigadas);
router.get('/audit', authMiddleware, adminMiddleware, getAuditLog);

module.exports = router;
