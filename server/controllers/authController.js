const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../services/db');

const JWT_SECRET = process.env.JWT_SECRET || 'campeche_secreto_local';

const login = async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await prisma.user.findUnique({ where: { username } });

    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: 'Contraseña incorrecta' });

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: '7d' } // 7 días para facilitar el uso offline/móvil
    );

    res.json({
      message: 'Login exitoso',
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
};

const register = async (req, res) => {
  try {
    const { username, password, name, role } = req.body;
    
    const existingUser = await prisma.user.findUnique({ where: { username } });
    if (existingUser) return res.status(400).json({ error: 'El usuario ya existe' });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        name,
        role: role || 'CAPTURIST'
      }
    });

    res.status(201).json({ message: 'Usuario creado exitosamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error al registrar usuario' });
  }
};

const listUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, username: true, name: true, role: true, createdAt: true }
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
};

const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { username, password, name, role } = req.body;

    const data = { username, name, role };
    if (password) {
      const salt = await bcrypt.genSalt(10);
      data.password = await bcrypt.hash(password, salt);
    }

    const updated = await prisma.user.update({
      where: { id },
      data
    });

    res.json({ message: 'Usuario actualizado exitosamente', user: { id: updated.id, username: updated.username } });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar usuario' });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (req.user && req.user.id === id) {
      return res.status(400).json({ error: 'No puedes eliminar tu propio usuario' });
    }
    await prisma.user.delete({ where: { id } });
    res.json({ message: 'Usuario eliminado exitosamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar usuario' });
  }
};

const setupAdmin = async (req, res) => {
  try {
    const adminExists = await prisma.user.findUnique({ where: { username: 'admin' } });
    if (adminExists) {
      return res.json({ message: 'El usuario admin ya existe' });
    }
    const salt = await bcrypt.genSalt(10);
    const adminPass = await bcrypt.hash('admin123', salt);
    await prisma.user.create({
      data: { username: 'admin', password: adminPass, name: 'Administradora Layda', role: 'ADMIN' }
    });
    const userPass = await bcrypt.hash('campo123', salt);
    await prisma.user.create({
      data: { username: 'campo', password: userPass, name: 'Capturista de Campo', role: 'CAPTURIST' }
    });

    res.json({ message: 'Usuarios por defecto creados' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = { login, register, listUsers, setupAdmin, updateUser, deleteUser };
