require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');

const app = express();

// Middleware
app.use(cors()); // Permite peticiones desde React (CORS)
app.use(express.json({ limit: '50mb' })); // Aumentamos límite para recibir fotos en Base64

// ------------------------------------------------------------
// CONFIGURACIÓN DE BASE DE DATOS (Tu conexión real)
// ------------------------------------------------------------
// Hemos añadido '/plataforma_campeche' para que se cree una DB específica y organizada.
const MONGO_URI = process.env.MONGO_URI;

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ Conectado exitosamente a MongoDB Atlas (Nube)'))
  .catch(err => {
    console.error('❌ Error conectando a MongoDB:', err);
    console.error('   Nota: Asegúrate de que tu IP actual esté permitida en MongoDB Atlas (Network Access -> Add IP -> Allow Access from Anywhere)');
  });

// ------------------------------------------------------------
// ESQUEMA DE DATOS (Mongoose)
// ------------------------------------------------------------
// Define la estructura exacta de cómo se guardarán los datos en la nube
const ReportSchema = new mongoose.Schema({
  municipio: String,
  comunidad: String,
  location: {
    lat: Number,
    lng: Number
  },
  needType: String,
  description: String,
  evidenceBase64: String, // La imagen se guarda como string Base64
  timestamp: Number,      // Fecha hora unix
  user: String,           // Nombre del capturista

  // Campos de control administrativo
  status: { type: String, default: 'Pendiente' }, // Pendiente, En Proceso, Resuelto
  syncedAt: { type: Date, default: Date.now }     // Fecha de llegada al servidor
});

const ReportModel = mongoose.model('Reporte', ReportSchema);

// Esquema de Usuario
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: String,
  role: { type: String, default: 'CAPTURIST' } // ADMIN, CAPTURIST
});

const UserModel = mongoose.model('Usuario', UserSchema);

// ------------------------------------------------------------
// RUTAS DE LA API (Endpoints)
// ------------------------------------------------------------

// 1. Endpoint para recibir reportes desde la App (Sincronización)
app.post('/api/reports', async (req, res) => {
  try {
    console.log(`📩 Recibiendo reporte de: ${req.body.municipio} (${req.body.needType})`);

    const newReport = new ReportModel(req.body);
    const savedReport = await newReport.save();

    console.log(`💾 Reporte guardado en la nube con ID: ${savedReport._id}`);

    // Respondemos con éxito y el ID generado
    res.status(201).json({
      message: 'Sincronización exitosa',
      id: savedReport._id
    });
  } catch (error) {
    console.error('❌ Error al guardar reporte:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// 2. Endpoint para listar reportes (Para el Dashboard administrativo)
app.get('/api/reports', async (req, res) => {
  try {
    // Devuelve los últimos 100 reportes ordenados por fecha
    const reports = await ReportModel.find().sort({ timestamp: -1 }).limit(100);
    res.json(reports);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Endpoint para actualizar un reporte (PUT)
app.put('/api/reports/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const updatedReport = await ReportModel.findByIdAndUpdate(id, updates, { new: true });

    if (!updatedReport) {
      return res.status(404).json({ error: 'Reporte no encontrado' });
    }

    console.log(`🔄 Reporte actualizado: ${id}`);
    res.json(updatedReport);
  } catch (error) {
    console.error('❌ Error al actualizar reporte:', error);
    res.status(500).json({ error: 'Error al actualizar el reporte' });
  }
});

// 4. Endpoint para eliminar un reporte (DELETE)
app.delete('/api/reports/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const deletedReport = await ReportModel.findByIdAndDelete(id);

    if (!deletedReport) {
      return res.status(404).json({ error: 'Reporte no encontrado' });
    }

    console.log(`🗑️ Reporte eliminado: ${id}`);
    res.json({ message: 'Reporte eliminado correctamente' });
  } catch (error) {
    console.error('❌ Error al eliminar reporte:', error);
    res.status(500).json({ error: 'Error al eliminar el reporte' });
  }
});

// ------------------------------------------------------------
// AUTENTICACIÓN
// ------------------------------------------------------------

// Registro de usuario (Para crear usuarios iniciales)
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, name, role } = req.body;

    // Verificar si ya existe
    const existingUser = await UserModel.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ error: 'El usuario ya existe' });
    }

    // Encriptar contraseña
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new UserModel({
      username,
      password: hashedPassword,
      name,
      role
    });

    await newUser.save();
    res.status(201).json({ message: 'Usuario creado exitosamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error al registrar usuario' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Buscar usuario
    const user = await UserModel.findOne({ username });
    if (!user) {
      return res.status(400).json({ error: 'Usuario no encontrado' });
    }

    // Verificar contraseña
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Contraseña incorrecta' });
    }

    // Retornar datos (sin password)
    res.json({
      username: user.username,
      name: user.name,
      role: user.role
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

// Listar usuarios (Solo para admins)
app.get('/api/users', async (req, res) => {
  try {
    const users = await UserModel.find({}, '-password'); // Excluir contraseña
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

// Ruta de prueba base
app.get('/', (req, res) => {
  res.send('🟢 API Plataforma Ciudadana Campeche - ONLINE');
});

// Iniciar el servidor en el puerto 3000
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 SERVIDOR BACKEND LISTO EN: http://localhost:${PORT}`);
  console.log(`   Esperando sincronización de reportes...\n`);
});