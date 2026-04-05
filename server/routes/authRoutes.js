const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authMiddleware, adminMiddleware } = require('../middlewares/authMiddleware');

router.post('/login', authController.login);
router.post('/register', authMiddleware, adminMiddleware, authController.register);
router.get('/users', authMiddleware, adminMiddleware, authController.listUsers);
router.put('/users/:id', authMiddleware, adminMiddleware, authController.updateUser);
router.delete('/users/:id', authMiddleware, adminMiddleware, authController.deleteUser);

module.exports = router;
