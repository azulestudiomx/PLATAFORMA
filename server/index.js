require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');

const compression = require('compression');

const app = express();

// Middleware
app.use(cors()); // Permite peticiones desde React (CORS)
app.use(compression()); // Comprime las respuestas HTTP (Gzip)
app.use(express.json({ limit: '50mb' })); // Aumentamos límite para recibir fotos en Base64

// Conexión a MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ Conectado exitosamente a MongoDB Atlas');
    seedUsers(); // Crear usuarios por defecto si no existen
  })
  .catch(err => console.error('❌ Error al conectar a MongoDB:', err));

// 1. Esquema de Reportes
const ReportSchema = new mongoose.Schema({
  municipio: String,
  comunidad: String,
  location: {
    lat: Number,
    lng: Number
  },
  needType: String,
  description: String,
  evidenceBase64: String, // La imagen se guarda como string Base64 (Legacy/Backup)
  evidenceUrl: String,    // URL de la imagen en Cloudinary
  timestamp: Number,      // Fecha hora unix
  user: String,           // Nombre del capturista

  // Campos de control administrativo
  status: { type: String, default: 'Pendiente' }, // Pendiente, En Proceso, Resuelto
  syncedAt: { type: Date, default: Date.now },    // Fecha de llegada al servidor
  customData: { type: Map, of: String },          // Datos dinámicos (clave: valor)
  response: String,                               // Respuesta oficial
  resolvedAt: Date                                // Fecha de resolución
});

// Indexar por timestamp para ordenar rápido
ReportSchema.index({ timestamp: -1 });

// ... (Other schemas remain same)

// C. REPORTES - Listar (Dashboard) - OPTIMIZADO CON PAGINACIÓN
app.get('/api/reports', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    // Usamos aggregate para no enviar la imagen base64 completa, solo un flag
    const reports = await ReportModel.aggregate([
      { $sort: { timestamp: -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $project: {
          municipio: 1,
          comunidad: 1,
          location: 1,
          needType: 1,
          timestamp: 1,
          status: 1,
          synced: 1,
          response: 1,
          resolvedAt: 1,
          evidenceUrl: 1,
          // Crea un campo booleano true si existe evidenceBase64 y no es null/vacio
          hasEvidence: {
            $cond: [
              { $and: [{ $ifNull: ["$evidenceBase64", false] }, { $ne: ["$evidenceBase64", ""] }] },
              { $and: [{ $ifNull: ["$evidenceUrl", false] }, { $ne: ["$evidenceUrl", ""] }] },
              true,
              false
            ]
          }
        }
      }
    ]);

    // Contar total de documentos para la paginación
    const total = await ReportModel.countDocuments();

    // Mapear _id a id para compatibilidad si es necesario
    const mappedReports = reports.map(r => ({ ...r, id: r._id }));

    res.json({
      data: mappedReports,
      total,
      page,
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const ReportModel = mongoose.model('Reporte', ReportSchema);

const PersonSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: String,
  address: String,
  ine: { type: String, unique: true },
  photo: String, // Base64
  inePhoto: String, // Base64
  createdAt: { type: Date, default: Date.now },
  synced: { type: Number, default: 1 } // 1=Synced, 0=Pending
});

const PersonModel = mongoose.model('Persona', PersonSchema);

// 2. Esquema de Usuarios
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true }, // Email o Usuario
  password: { type: String, required: true }, // Hash encriptado
  name: { type: String, required: true },
  role: { type: String, enum: ['ADMIN', 'CAPTURIST'], default: 'CAPTURIST' }
});

const UserModel = mongoose.model('Usuario', UserSchema);

// 3. Esquema de Eventos (Calendario)
const EventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  date: { type: Date, required: true },
  location: String,
  type: { type: String, default: 'Reunión' }, // Reunión, Visita, Mitin
  description: String,
  createdBy: String
});

const EventModel = mongoose.model('Evento', EventSchema);

// 4. Esquema de Configuración (Temas y Campos)
const ConfigSchema = new mongoose.Schema({
  theme: {
    primary: { type: String, default: '#8B0000' },
    secondary: { type: String, default: '#FFFFFF' },
    accent: { type: String, default: '#FFD700' }
  },
  needTypes: { type: [String], default: ['Agua Potable', 'Luz Eléctrica', 'Drenaje', 'Salud', 'Educación', 'Seguridad', 'Otro'] },
  customFields: [{
    id: String,
    label: String,
    type: { type: String, enum: ['text', 'number', 'date', 'select'], default: 'text' },
    options: [String] // Para tipo select
  }]
});

const ConfigModel = mongoose.model('Configuracion', ConfigSchema);

// ------------------------------------------------------------
// LÓGICA DE SEMILLA (Crear usuarios por defecto)
// ------------------------------------------------------------
async function seedUsers() {
  try {
    const count = await UserModel.countDocuments();
    if (count === 0) {
      console.log('🌱 Base de datos de usuarios vacía. Creando usuarios por defecto...');

      const salt = await bcrypt.genSalt(10);

      // Admin
      const adminPass = await bcrypt.hash('admin123', salt);
      const admin = new UserModel({
        username: 'admin', // Usuario simple por defecto
        password: adminPass,
        name: 'Administradora Layda',
        role: 'ADMIN'
      });

      // Capturista
      const userPass = await bcrypt.hash('campo123', salt);
      const capturist = new UserModel({
        username: 'campo',
        password: userPass,
        name: 'Capturista de Campo',
        role: 'CAPTURIST'
      });

      await admin.save();
      await capturist.save();

      console.log('✅ Usuarios creados:');
      console.log('   1. Admin: admin / admin123');
      console.log('   2. Campo: campo / campo123');
    }
  } catch (error) {
    console.error('Error en seedUsers:', error);
  }
}

// ------------------------------------------------------------
// ------------------------------------------------------------
// RUTAS DE LA API (Endpoints)
// ------------------------------------------------------------

// Endpoint de recuperación para crear admin si no existe
app.get('/api/setup', async (req, res) => {
  try {
    const adminExists = await UserModel.findOne({ username: 'admin' });
    if (adminExists) {
      return res.json({ message: 'El usuario admin ya existe. (admin / admin123)' });
    }

    const salt = await bcrypt.genSalt(10);
    const adminPass = await bcrypt.hash('admin123', salt);
    const admin = new UserModel({
      username: 'admin',
      password: adminPass,
      name: 'Administradora Layda',
      role: 'ADMIN'
    });
    await admin.save();
    res.json({ message: '✅ Usuario admin creado exitosamente. Credenciales: admin / admin123' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// A. AUTH - Login Real
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // 1. Buscar usuario
    const user = await UserModel.findOne({ username });
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // 2. Validar contraseña
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Contraseña incorrecta' });
    }

    // 3. Responder con datos del usuario (sin el password)
    res.json({
      message: 'Login exitoso',
      user: {
        username: user.username,
        name: user.name,
        role: user.role
      }
    });

  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error del servidor' });
  }
});

// Registro de usuario (Para crear usuarios desde el panel)
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

// Listar usuarios (Solo para admins)
app.get('/api/users', async (req, res) => {
  try {
    const users = await UserModel.find({}, '-password'); // Excluir contraseña
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener usuarios' });
  }
});

const cloudinary = require('cloudinary').v2;

// Configuración de Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// B. REPORTES - Recibir (Sincronización)
app.post('/api/reports', async (req, res) => {
  try {
    console.log(`📩 Recibiendo reporte de: ${req.body.municipio} (${req.body.needType})`);

    let reportData = { ...req.body };

    // Si viene imagen en Base64, subirla a Cloudinary
    if (reportData.evidenceBase64 && reportData.evidenceBase64.startsWith('data:image')) {
      try {
        console.log('☁️ Subiendo imagen a Cloudinary...');
        const uploadResponse = await cloudinary.uploader.upload(reportData.evidenceBase64, {
          folder: 'plataforma_ciudadana',
          resource_type: 'image'
        });

        console.log(`✅ Imagen subida: ${uploadResponse.secure_url}`);

        // Guardar URL y limpiar Base64 para ahorrar espacio
        reportData.evidenceUrl = uploadResponse.secure_url;
        reportData.evidenceBase64 = ''; // Opcional: dejar vacío o eliminar el campo
      } catch (uploadError) {
        console.error('⚠️ Error subiendo a Cloudinary (se guardará local):', uploadError.message);
        // Si falla, se guarda el Base64 original como respaldo
      }
    }

    const newReport = new ReportModel(reportData);
    const savedReport = await newReport.save();

    console.log(`💾 Reporte guardado en la nube con ID: ${savedReport._id}`);

    res.status(201).json({
      message: 'Sincronización exitosa',
      id: savedReport._id
    });
  } catch (error) {
    console.error('❌ Error al guardar reporte:', error);
    res.status(500).json({ error: error.message || 'Error interno del servidor' });
  }
});

// C. REPORTES - Obtener uno por ID (para ver evidencia)
app.get('/api/reports/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const report = await ReportModel.findById(id);
    if (!report) {
      return res.status(404).json({ error: 'Reporte no encontrado' });
    }
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener el reporte' });
  }
});



// D. REPORTES - Actualizar (PUT)
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

// E. REPORTES - Eliminar (DELETE)
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
// EVENTOS (CALENDARIO)
// ------------------------------------------------------------

// Listar eventos
app.get('/api/events', async (req, res) => {
  try {
    const events = await EventModel.find().sort({ date: 1 });
    res.json(events);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener eventos' });
  }
});

// Crear evento
app.post('/api/events', async (req, res) => {
  try {
    const newEvent = new EventModel(req.body);
    await newEvent.save();
    res.status(201).json(newEvent);
  } catch (error) {
    res.status(500).json({ error: 'Error al crear evento' });
  }
});

// Eliminar evento
app.delete('/api/events/:id', async (req, res) => {
  try {
    await EventModel.findByIdAndDelete(req.params.id);
    res.json({ message: 'Evento eliminado' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar evento' });
  }
});

// ------------------------------------------------------------
// CONFIGURACIÓN (Temas y Campos)
// ------------------------------------------------------------

// Obtener configuración (o crear por defecto)
app.get('/api/config', async (req, res) => {
  try {
    let config = await ConfigModel.findOne();
    if (!config) {
      config = new ConfigModel({
        theme: { primary: '#8B0000', secondary: '#FFFFFF', accent: '#FFD700' },
        needTypes: ['Agua Potable', 'Luz Eléctrica', 'Drenaje', 'Salud', 'Educación', 'Seguridad', 'Otro'],
        customFields: []
      });
      await config.save();
    }
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener configuración' });
  }
});

// Actualizar configuración
app.post('/api/config', async (req, res) => {
  try {
    let config = await ConfigModel.findOne();
    if (!config) {
      config = new ConfigModel(req.body);
    } else {
      config.theme = req.body.theme || config.theme;
      config.needTypes = req.body.needTypes || config.needTypes;
      config.customFields = req.body.customFields || config.customFields;
    }
    await config.save();
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: 'Error al guardar configuración' });
  }
});

// G. PADRÓN DE PERSONAS
app.get('/api/people', async (req, res) => {
  try {
    const people = await PersonModel.find().sort({ createdAt: -1 });
    res.json(people);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener padrón' });
  }
});

app.post('/api/people', async (req, res) => {
  try {
    const newPerson = new PersonModel(req.body);
    await newPerson.save();
    res.status(201).json(newPerson);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'La clave INE ya está registrada' });
    }
    res.status(500).json({ error: 'Error al registrar persona' });
  }
});

app.delete('/api/people/:id', async (req, res) => {
  try {
    await PersonModel.findByIdAndDelete(req.params.id);
    res.json({ message: 'Persona eliminada' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar persona' });
  }
});

app.put('/api/people/:id', async (req, res) => {
  try {
    const updatedPerson = await PersonModel.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updatedPerson) return res.status(404).json({ error: 'Persona no encontrada' });
    res.json(updatedPerson);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'La clave INE ya está registrada en otra persona' });
    }
    res.status(500).json({ error: 'Error al actualizar persona' });
  }
});

// Ruta de prueba base
app.get('/', (req, res) => {
  res.send('🟢 API Plataforma Ciudadana Campeche - ONLINE');
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 SERVIDOR BACKEND LISTO EN: http://localhost:${PORT}`);
});