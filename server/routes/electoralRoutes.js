const express = require('express');
const router = express.Router();
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { authMiddleware, requireLevel } = require('../middlewares/authMiddleware');
const ctrl = require('../controllers/electoralController');

// El consultor IA consume cuota de un servicio externo y de pago: se limita
// por usuario para que una sola cuenta no la agote.
const aiLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  // Se limita por usuario; sin sesión, por IP (normalizada para IPv6).
  keyGenerator: (req, res) => req.user?.id || ipKeyGenerator(req, res),
  message: {
    error: 'Has hecho muchas consultas al Consultor IA. Espera unos minutos.'
  }
});

router.get('/resumen', authMiddleware, requireLevel(4), ctrl.getResumen);
router.get('/secciones', authMiddleware, requireLevel(4), ctrl.getSecciones);
router.get('/municipios', authMiddleware, requireLevel(4), ctrl.getMunicipios);
router.get('/demografia/:seccion', authMiddleware, requireLevel(4), ctrl.getDemografia);
router.get('/cobertura-demografica', authMiddleware, requireLevel(4), ctrl.getCoberturaDemografica);
router.post('/meta', authMiddleware, requireLevel(4), ctrl.calcularMetaEndpoint);
router.post('/ai-consult', authMiddleware, requireLevel(3), aiLimiter, ctrl.aiConsult);

module.exports = router;
