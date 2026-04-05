require('dotenv').config();
const express = require('express');
const cors = require('cors');
const compression = require('compression');

// Routes
const authRoutes = require('./routes/authRoutes');
const reportRoutes = require('./routes/reportRoutes');

const app = express();

// Middlewares
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '50mb' }));

// Initial Setup Endpoint
app.get('/api/setup', require('./controllers/authController').setupAdmin);

// Register Routes
app.use('/api/auth', authRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api', require('./routes/systemRoutes'));

app.get('/', (req, res) => {
  res.send('🟢 API Plataforma Ciudadana Campeche V2 (SQLite/Prisma) - ONLINE');
});

// For Person, Event, Config logic, we can stub them or add them later.

const PORT = process.env.PORT || 3003;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 SERVIDOR BACKEND LISTO EN: http://0.0.0.0:${PORT}`);
});