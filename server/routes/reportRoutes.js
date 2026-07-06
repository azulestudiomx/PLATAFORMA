const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { authMiddleware } = require('../middlewares/authMiddleware');

router.get('/', authMiddleware, reportController.getReports);
router.post('/', authMiddleware, reportController.createReport);
router.get('/:id', authMiddleware, reportController.getReportById);
router.get('/:id/history', authMiddleware, reportController.getReportHistory);
router.put('/:id', authMiddleware, reportController.updateReport);
router.delete('/:id', authMiddleware, reportController.deleteReport);

module.exports = router;
