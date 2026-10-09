/**
 * scripts/normalize-padron.js
 * Empareja los nombres de municipio del padrón con el catálogo oficial.
 *
 * Los registros llegaron de capturas y de un Excel, así que conviven
 * "CALAKMUL", "Calakmul" y "calakmul" como si fueran municipios distintos.
 * Eso rompe los filtros y parte los agrupados en varias filas.
 *
 * También reintenta asignar el territorio de quien quedó sin él y reporta
 * las secciones que no existen en la geografía electoral.
 *
 * Uso:  node scripts/normalize-padron.js [--dry]
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const prisma = require('../services/db');
const { MUNICIPIOS_INE, norm } = require('../services/electoralData');
const { findSeccion } = require('../services/territoryService');

const DRY = process.argv.includes('--dry');

// Nombre canónico por nombre normalizado: CALAKMUL → Calakmul
const CANONICO = Object.fromEntries(
  Object.values(MUNICIPIOS_INE).map(n => [norm(n), n])
);

const main = async () => {
  console.log(`\n▸ Normalizando padrón${DRY ? ' (simulación, no se escribe)' : ''}…\n`);

  // ── 1. Nombres de municipio ──
  const grupos = await prisma.person.groupBy({
    by: ['municipio'],
    _count: { _all: true }
  });

  let corregidos = 0;
  let sinCatalogo = [];

  for (const g of grupos) {
    if (!g.municipio) continue;
    const canon = CANONICO[norm(g.municipio)];

    if (!canon) {
      sinCatalogo.push({ valor: g.municipio, registros: g._count._all });
      continue;
    }
    if (canon === g.municipio) continue;

    console.log(`  "${g.municipio}" → "${canon}"  (${g._count._all} registros)`);
    if (!DRY) {
      const r = await prisma.person.updateMany({
        where: { municipio: g.municipio },
        data: { municipio: canon }
      });
      corregidos += r.count;
    } else {
      corregidos += g._count._all;
    }
  }

  console.log(`\n  ${corregidos} registros con municipio normalizado`);
  if (sinCatalogo.length) {
    console.log('\n  ⚠ Valores que no corresponden a ningún municipio de Campeche:');
    sinCatalogo.forEach(s => console.log(`     "${s.valor}" — ${s.registros} registros`));
  }

  // ── 2. Territorio de quien quedó sin asignar ──
  console.log('\n▸ Reasignando territorio…');
  const huerfanos = await prisma.person.findMany({
    where: { territoryId: null, seccion: { not: null } },
    select: { id: true, seccion: true, name: true }
  });

  let asignados = 0;
  const seccionesInvalidas = {};

  for (const p of huerfanos) {
    const t = await findSeccion(p.seccion);
    if (t) {
      if (!DRY) {
        await prisma.person.update({ where: { id: p.id }, data: { territoryId: t.id } });
      }
      asignados++;
    } else {
      seccionesInvalidas[p.seccion] = (seccionesInvalidas[p.seccion] || 0) + 1;
    }
  }

  console.log(`  ${asignados} personas conectadas a su sección`);

  const invalidas = Object.entries(seccionesInvalidas);
  if (invalidas.length) {
    console.log('\n  ⚠ Secciones que no existen en la geografía electoral de Campeche:');
    invalidas
      .sort((a, b) => b[1] - a[1])
      .forEach(([sec, n]) => console.log(`     sección "${sec}" — ${n} registro(s)`));
    console.log('     Estos registros necesitan corrección manual en el padrón.');
  }

  // ── 3. Resumen ──
  const [total, conTerritorio, sinSeccion] = await Promise.all([
    prisma.person.count(),
    prisma.person.count({ where: { territoryId: { not: null } } }),
    prisma.person.count({ where: { OR: [{ seccion: null }, { seccion: '' }] } })
  ]);

  console.log('\n╭─ Estado del padrón ─────────────────────────────');
  console.log(`│ total:                 ${total}`);
  console.log(`│ con sección válida:    ${conTerritorio}`);
  console.log(`│ sin sección declarada: ${sinSeccion}`);
  console.log(`│ con sección inválida:  ${total - conTerritorio - sinSeccion}`);
  console.log('╰─────────────────────────────────────────────────\n');

  await prisma.$disconnect();
};

main().catch(async (e) => {
  console.error('Error:', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
