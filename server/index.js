const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs'); // Necesario: npm install bcryptjs

const app = express();

// Middleware
app.use(cors()); // Permite peticiones desde React (CORS)
app.use(express.json({ limit: '50mb' })); // Aumentamos límite para recibir fotos en Base64

// ------------------------------------------------------------
// CONFIGURACIÓN DE BASE DE DATOS (Tu conexión real)
// ------------------------------------------------------------
// Hemos añadido '/plataforma_campeche' para que se cree una DB específica y organizada.
const MONGO_URI = 'mongodb+srv://cacenitez3_db_user:icAb0ajgklF5pOqr@cluster0.8rvrsny.mongodb.net/plataforma_campeche?appName=Cluster0';

mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('✅ Conectado exitosamente a MongoDB Atlas (Nube)');
    seedUsers(); // Verificar y crear usuarios por defecto si no existen
  })
  .catch(err => {
    console.error('❌ Error conectando a MongoDB:', err);
    console.error('   Nota: Asegúrate de que tu IP actual esté permitida en MongoDB Atlas (Network Access -> Add IP -> Allow Access from Anywhere)');
  });

// ------------------------------------------------------------
// ESQUEMAS DE DATOS (Mongoose)
// ------------------------------------------------------------

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
  evidenceBase64: String, 
  timestamp: Number,      
  user: String,           
  status: { type: String, default: 'Pendiente' }, 
  syncedAt: { type: Date, default: Date.now }     
});

const ReportModel = mongoose.model('Reporte', ReportSchema);

// 2. Esquema de Usuarios
const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true }, // Email
  password: { type: String, required: true }, // Hash encriptado
  name: { type: String, required: true },
  role: { type: String, enum: ['ADMIN', 'CAPTURIST'], default: 'CAPTURIST' }
});

const UserModel = mongoose.model('User', UserSchema);

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
        username: 'admin@campeche.gob.mx',
        password: adminPass,
        name: 'Administradora Layda',
        role: 'ADMIN'
      });

      // Capturista
      const userPass = await bcrypt.hash('campo123', salt);
      const capturist = new UserModel({
        username: 'campo@campeche.gob.mx',
        password: userPass,
        name: 'Capturista de Campo',
        role: 'CAPTURIST'
      });

      await admin.save();
      await capturist.save();
      
      console.log('✅ Usuarios creados:');
      console.log('   1. Admin: admin@campeche.gob.mx / admin123');
      console.log('   2. Campo: campo@campeche.gob.mx / campo123');
    }
  } catch (error) {
    console.error('Error en seedUsers:', error);
  }
}

// ------------------------------------------------------------
// RUTAS DE LA API (Endpoints)
// ------------------------------------------------------------

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

// B. REPORTES - Recibir (Sincronización)
app.post('/api/reports', async (req, res) => {
  try {
    console.log(`📩 Recibiendo reporte de: ${req.body.municipio} (${req.body.needType})`);
    
    const newReport = new ReportModel(req.body);
    const savedReport = await newReport.save();
    
    console.log(`💾 Reporte guardado en la nube con ID: ${savedReport._id}`);
    
    res.status(201).json({ 
      message: 'Sincronización exitosa', 
      id: savedReport._id 
    });
  } catch (error) {
    console.error('❌ Error al guardar reporte:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// C. REPORTES - Listar (Dashboard)
app.get('/api/reports', async (req, res) => {
  try {
    const reports = await ReportModel.find().sort({ timestamp: -1 }).limit(100);
    res.json(reports);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Ruta base
app.get('/', (req, res) => {
  res.send('🟢 API Plataforma Ciudadana Campeche - ONLINE (Con Auth)');
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 SERVIDOR BACKEND LISTO EN: http://localhost:${PORT}`);
});