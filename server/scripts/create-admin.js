/**
 * Crea (o resetea la contraseña de) un usuario con rol elevado.
 * Reemplaza al antiguo endpoint público /api/setup, que era un riesgo.
 *
 * Uso:
 *   node scripts/create-admin.js <usuario> <contraseña> [nombre] [rol]
 *
 * El rol por defecto es SUPERADMIN. Roles válidos: SUPERADMIN, CANDIDATO,
 * COORD_GENERAL, COORD_MUNICIPAL, COORD_SECCIONAL, PROMOTOR, CAPTURISTA.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const bcrypt = require('bcryptjs');
const prisma = require('../services/db');
const { canonical, levelOf, ROLES } = require('../config/roles');

const username = process.argv[2] || process.env.ADMIN_USERNAME;
const password = process.argv[3] || process.env.ADMIN_PASSWORD;
const name = process.argv[4] || process.env.ADMIN_NAME || 'Administrador';
const roleArg = process.argv[5] || process.env.ADMIN_ROLE || 'SUPERADMIN';

const main = async () => {
  if (!username || !password) {
    console.error('Uso: node scripts/create-admin.js <usuario> <contraseña> [nombre] [rol]');
    console.error(`Roles: ${Object.keys(ROLES).join(', ')}`);
    process.exit(1);
  }

  const role = canonical(roleArg);
  const level = levelOf(role);

  if (level <= 2 && password.length < 12) {
    console.error('Para un rol de nivel 2 o superior la contraseña debe tener al menos 12 caracteres.');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('La contraseña debe tener al menos 8 caracteres.');
    process.exit(1);
  }

  // Todo usuario nuevo entra a la campaña por defecto y, si manda, al estado.
  const campaign = await prisma.campaign.findFirst({ where: { isDefault: true } });
  const estado = await prisma.territory.findUnique({
    where: { type_code: { type: 'ESTADO', code: '04' } }
  });

  const hashed = await bcrypt.hash(password, 10);
  const existing = await prisma.user.findUnique({ where: { username } });

  if (existing) {
    await prisma.user.update({
      where: { username },
      data: {
        password: hashed, role, level, active: true,
        passwordChangedAt: new Date(), failedAttempts: 0, lockedUntil: null,
        campaignId: existing.campaignId || campaign?.id || null,
        territoryId: existing.territoryId || (level <= 2 ? estado?.id ?? null : null)
      }
    });
    // Cambiar la contraseña cierra las sesiones abiertas de esa cuenta.
    const revoked = await prisma.session.updateMany({
      where: { userId: existing.id, revokedAt: null },
      data: { revokedAt: new Date(), revokedBy: 'create-admin' }
    });
    console.log(`✅ Contraseña actualizada para "${username}" (rol ${role}, nivel ${level}).`);
    if (revoked.count) console.log(`   ${revoked.count} sesión(es) previa(s) cerrada(s).`);
  } else {
    await prisma.user.create({
      data: {
        username, password: hashed, name, role, level,
        campaignId: campaign?.id || null,
        territoryId: level <= 2 ? estado?.id ?? null : null
      }
    });
    console.log(`✅ Usuario "${username}" creado (rol ${role}, nivel ${level}).`);
  }

  await prisma.$disconnect();
  process.exit(0);
};

main().catch(async (err) => {
  console.error('Error:', err.message);
  await prisma.$disconnect();
  process.exit(1);
});
