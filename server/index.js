const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// El servidor no arranca sin un secreto JWT real: evita tokens forjables.
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('FATAL: JWT_SECRET no está definido o es demasiado corto (mínimo 32 caracteres).');
  console.error('Genera uno con: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
  process.exit(1);
}

const express = require('express');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

// Routes
const authRoutes = require('./routes/authRoutes');
const reportRoutes = require('./routes/reportRoutes');

const app = express();

// Middlewares
// CORS_ORIGIN: lista separada por comas (ej. "https://plataformacampeche.azulestudiomx.cloud")
// Sin definir = permite cualquier origen (solo recomendable en desarrollo).
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
  : true;
app.use(cors({ origin: corsOrigins }));
app.use(compression());
app.use(express.json({ limit: '50mb' }));

// Máximo 20 intentos de login por IP cada 15 minutos
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de inicio de sesión. Intenta de nuevo en 15 minutos.' }
});
app.use('/api/auth/login', loginLimiter);

// Register Routes
app.use('/api/auth', authRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api', require('./routes/systemRoutes'));
app.use('/api/electoral', require('./routes/electoralRoutes'));
app.use('/api/stats', require('./routes/statsRoutes'));

app.get('/', (req, res) => {
  res.send('🟢 API Plataforma Ciudadana Campeche V2 (SQLite/Prisma) - ONLINE');
});

const PORT = process.env.PORT || 3003;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 SERVIDOR BACKEND LISTO EN: http://0.0.0.0:${PORT}`);
});
