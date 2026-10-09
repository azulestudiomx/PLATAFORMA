const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// El servidor no arranca sin secretos reales: evita tokens forjables y
// datos personales guardados en claro por descuido de configuración.
const requiredSecrets = [
  ['JWT_SECRET', 32, 'node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'],
  ['ENCRYPTION_KEY', 64, 'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'],
  ['INE_HASH_SALT', 32, 'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"']
];

for (const [name, minLength, howTo] of requiredSecrets) {
  const value = process.env[name];
  if (!value || value.length < minLength) {
    console.error(`FATAL: ${name} no está definido o es demasiado corto (mínimo ${minLength} caracteres).`);
    console.error(`Genera uno con: ${howTo}`);
    process.exit(1);
  }
}

if (!process.env.DATABASE_URL) {
  console.error('FATAL: DATABASE_URL no está definido.');
  process.exit(1);
}

const express = require('express');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const app = express();

// ── Middlewares ──
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
  : true;
app.use(cors({ origin: corsOrigins }));
app.use(compression());
app.use(express.json({ limit: '50mb' }));

// Confía en el proxy inverso para leer la IP real del cliente.
app.set('trust proxy', 1);

// ── Límites de tasa ──
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de inicio de sesión. Intenta de nuevo en 15 minutos.' }
});
app.use('/api/auth/login', loginLimiter);

// Techo general: protege la base de una app en bucle o de un raspado.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas peticiones. Espera un momento.' }
});
app.use('/api', apiLimiter);

// ── Rutas ──
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/reports', require('./routes/reportRoutes'));
app.use('/api/people', require('./routes/peopleRoutes'));
app.use('/api/media', require('./routes/mediaRoutes'));
app.use('/api/territories', require('./routes/territoryRoutes'));
app.use('/api/structure', require('./routes/structureRoutes'));
app.use('/api/quality', require('./routes/qualityRoutes'));
app.use('/api/brigades', require('./routes/brigadeRoutes'));
app.use('/api/surveys', require('./routes/surveyRoutes'));
app.use('/api/messaging', require('./routes/messagingRoutes'));
app.use('/api/electoral', require('./routes/electoralRoutes'));
app.use('/api/stats', require('./routes/statsRoutes'));
app.use('/api', require('./routes/systemRoutes'));

app.get('/api/health', async (req, res) => {
  const prisma = require('./services/db');
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: 'ok',
      db: 'postgresql',
      version: require('./package.json').version,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(503).json({ status: 'degradado', error: err.message });
  }
});

app.get('/', (req, res) => {
  res.send('🟢 API Plataforma Ciudadana Campeche (PostgreSQL/Prisma) — ONLINE');
});

// 404 en JSON para que la app no reciba HTML donde espera datos.
app.use('/api', (req, res) => {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
});

// Último recurso: nada de trazas hacia el cliente.
app.use((err, req, res, next) => {
  console.error('Error no controlado:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

const PORT = process.env.PORT || 3003;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Backend listo en http://0.0.0.0:${PORT}`);
  console.log(`   Base de datos: PostgreSQL`);
  console.log(`   Archivos:      ${process.env.UPLOAD_DIR || './uploads'}\n`);
});
