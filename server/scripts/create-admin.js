/**
 * Crea (o resetea la contraseña de) un usuario administrador.
 * Reemplaza al antiguo endpoint público /api/setup, que era un riesgo de seguridad.
 *
 * Uso:
 *   node scripts/create-admin.js <usuario> <contraseña> [nombre]
 *   o con variables de entorno: ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_NAME
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const prisma = require('../services/db');

const username = process.argv[2] || process.env.ADMIN_USERNAME;
const password = process.argv[3] || process.env.ADMIN_PASSWORD;
const name = process.argv[4] || process.env.ADMIN_NAME || 'Administrador';

const main = async () => {
  if (!username || !password) {
    console.error('Uso: node scripts/create-admin.js <usuario> <contraseña> [nombre]');
    process.exit(1);
  }
  if (password.length < 12) {
    console.error('La contraseña de administrador debe tener al menos 12 caracteres.');
    process.exit(1);
  }

  const hashed = await bcrypt.hash(password, 10);
  const existing = await prisma.user.findUnique({ where: { username } });

  if (existing) {
    await prisma.user.update({
      where: { username },
      data: { password: hashed, role: 'ADMIN' }
    });
    console.log(`✅ Contraseña actualizada para "${username}" (rol ADMIN).`);
  } else {
    await prisma.user.create({
      data: { username, password: hashed, name, role: 'ADMIN' }
    });
    console.log(`✅ Usuario administrador "${username}" creado.`);
  }
  process.exit(0);
};

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
