const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/surveyController');
const { authMiddleware, requireLevel } = require('../middlewares/authMiddleware');

router.get('/', authMiddleware, ctrl.listSurveys);
router.get('/:id', authMiddleware, ctrl.getSurvey);
router.get('/:id/resultados', authMiddleware, requireLevel(4), ctrl.resultados);

// Aplicar la encuesta es trabajo de campo: lo puede hacer cualquiera con sesión.
router.post('/:id/responder', authMiddleware, ctrl.responder);

// Diseñar y cerrar encuestas es de coordinación.
router.post('/', authMiddleware, requireLevel(3), ctrl.createSurvey);
router.put('/:id', authMiddleware, requireLevel(3), ctrl.updateSurvey);
router.delete('/:id', authMiddleware, requireLevel(3), ctrl.deleteSurvey);

module.exports = router;
