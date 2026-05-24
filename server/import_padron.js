/**
 * import_padron.js
 * Lee el JSON limpio generado por parse_excel.py e inserta en masa
 * todos los registros en la base de datos SQLite via Prisma.
 * 
 * Uso: node import_padron.js
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const JSON_PATH = path.join(__dirname, 'padron_campeche.json');

async function main() {
    console.log('🚀 Iniciando importación de Padrón de Ciudadanos...\n');

    // Verificar que el JSON exista
    if (!fs.existsSync(JSON_PATH)) {
        console.error(`❌ Error: No se encontró ${JSON_PATH}`);
        console.error('   Ejecuta primero: python3 parse_excel.py');
        process.exit(1);
    }

    const records = JSON.parse(fs.readFileSync(JSON_PATH, 'utf-8'));
    console.log(`📋 Registros en JSON: ${records.length}`);

    // Verificar cuántos ya existen en la BD
    const existingCount = await prisma.person.count();
    console.log(`📊 Registros actuales en BD: ${existingCount}`);

    if (existingCount > 0) {
        console.log('\n⚠️  La tabla ya tiene registros. Importando solo los nuevos (por clave INE)...');
    }

    let inserted = 0;
    let skipped = 0;
    let errors = 0;

    for (const record of records) {
        try {
            // Verificar si la clave INE ya existe para evitar duplicados
            const exists = await prisma.person.findUnique({
                where: { ine: record.ine }
            });

            if (exists) {
                skipped++;
                continue;
            }

            await prisma.person.create({
                data: {
                    name: record.name,
                    phone: record.phone || null,
                    address: record.address || null,
                    municipio: record.municipio || null,
                    localidad: record.localidad || null,
                    distrito: record.distrito || null,
                    zona: record.zona || null,
                    seccion: record.seccion || null,
                    ine: record.ine,
                    synced: 1
                }
            });
            inserted++;

            // Mostrar progreso cada 50 registros
            if (inserted % 50 === 0) {
                console.log(`   ✅ ${inserted} registros insertados...`);
            }
        } catch (err) {
            errors++;
            console.error(`   ❌ Error en ${record.name}: ${err.message}`);
        }
    }

    // Conteo final
    const finalCount = await prisma.person.count();

    console.log('\n' + '='.repeat(50));
    console.log('📊 RESULTADO FINAL DE IMPORTACIÓN');
    console.log('='.repeat(50));
    console.log(`   ✅ Insertados:    ${inserted}`);
    console.log(`   ⏭️  Omitidos:      ${skipped} (ya existían)`);
    console.log(`   ❌ Errores:       ${errors}`);
    console.log(`   📋 Total en BD:   ${finalCount}`);
    console.log('='.repeat(50));
    console.log('\n🎉 ¡Importación completada! El Padrón de Ciudadanos ya está activo.\n');
}

main()
    .catch((e) => {
        console.error('Error crítico:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
