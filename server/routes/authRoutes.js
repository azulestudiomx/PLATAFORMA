const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authMiddleware, requireLevel } = require('../middlewares/authMiddleware');

// Público
router.post('/login', authController.login);

// Sesión propia
router.post('/logout', authMiddleware, authController.logout);
router.get('/me', authMiddleware, authController.me);
router.get('/roles', authMiddleware, authController.getRoles);
router.get('/sessions', authMiddleware, authController.listSessions);
router.delete('/sessions/:id', authMiddleware, authController.revokeSession);

// Gestión de usuarios: a partir de coordinador municipal
router.post('/register', authMiddleware, requireLevel(3), authController.register);
router.get('/users', authMiddleware, requireLevel(3), authController.listUsers);
router.put('/users/:id', authMiddleware, requireLevel(3), authController.updateUser);
router.delete('/users/:id', authMiddleware, requireLevel(3), authController.deleteUser);

module.exports = router;
