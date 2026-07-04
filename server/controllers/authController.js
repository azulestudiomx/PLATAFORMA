const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../services/db');

const JWT_SECRET = process.env.JWT_SECRET;

const login = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
    }
    const user = await prisma.user.findUnique({ where: { username } });

    // Mensaje idéntico exista o no el usuario: evita enumeración de cuentas
    if (!user) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });

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

    if (typeof username !== 'string' || username.trim().length < 3) {
      return res.status(400).json({ error: 'El usuario debe tener al menos 3 caracteres' });
    }
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
    }
    if (role && !['ADMIN', 'CAPTURIST'].includes(role)) {
      return res.status(400).json({ error: 'Rol inválido' });
    }

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

    if (role && !['ADMIN', 'CAPTURIST'].includes(role)) {
      return res.status(400).json({ error: 'Rol inválido' });
    }
    const data = { username, name, role };
    if (password) {
      if (typeof password !== 'string' || password.length < 8) {
        return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
      }
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

module.exports = { login, register, listUsers, updateUser, deleteUser };
