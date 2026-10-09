const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/messagingController');
const { authMiddleware, requireLevel } = require('../middlewares/authMiddleware');

// Mandar mensajes a miles de personas es una acción externa e irreversible:
// queda reservada a la dirección de campaña.
router.get('/proveedores', authMiddleware, requireLevel(3), ctrl.proveedores);

router.get('/', authMiddleware, requireLevel(3), ctrl.list);
router.post('/', authMiddleware, requireLevel(3), ctrl.create);
router.post('/vista-previa', authMiddleware, requireLevel(3), ctrl.vistaPrevia);

router.put('/:id', authMiddleware, requireLevel(3), ctrl.update);
router.delete('/:id', authMiddleware, requireLevel(2), ctrl.remove);

router.get('/:id/mensajes', authMiddleware, requireLevel(3), ctrl.mensajes);
router.post('/:id/preparar', authMiddleware, requireLevel(3), ctrl.preparar);
// El disparo final exige nivel 2 y confirmación explícita en el cuerpo.
router.post('/:id/enviar', authMiddleware, requireLevel(2), ctrl.enviar);

module.exports = router;
