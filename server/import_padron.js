/**
 * import_padron.js
 * Lee el JSON limpio generado por parse_excel.py e inserta en masa
 * todos los registros en la base de datos SQLite via Prisma, incluyendo email y cumpleaños.
 * Limpia los registros anteriores para asegurar una importación estatal limpia.
 * 
 * Uso: node import_padron.js
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const JSON_PATH = path.join(__dirname, 'padron_campeche.json');

async function main() {
    console.log('🚀 Iniciando importación del Padrón Estatal de Ciudadanos...\n');

    // Verificar que el JSON exista
    if (!fs.existsSync(JSON_PATH)) {
        console.error(`❌ Error: No se encontró ${JSON_PATH}`);
        console.error('   Ejecuta primero: python3 parse_excel.py');
        process.exit(1);
    }

    const records = JSON.parse(fs.readFileSync(JSON_PATH, 'utf-8'));
    console.log(`📋 Registros cargados desde el JSON: ${records.length}`);

    // Limpiar tabla Person de la base de datos para una importación estatal limpia y sin duplicados
    console.log('⚠️  Vaciando la tabla de ciudadanos para una importación estatal limpia...');
    const deletedCount = await prisma.person.deleteMany();
    console.log(`🧹 Eliminados ${deletedCount.count} registros previos.`);

    let inserted = 0;
    let errors = 0;

    console.log('\n📥 Importando nuevos registros estatales...');
    
    // Inserción secuencial rápida
    for (const record of records) {
        try {
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
                    email: record.email || null,
                    birthday: record.birthday || null,
                    synced: 1
                }
            });
            inserted++;

            // Mostrar progreso cada 100 registros
            if (inserted % 100 === 0) {
                console.log(`   ✅ ${inserted} registros insertados...`);
            }
        } catch (err) {
            errors++;
            console.error(`   ❌ Error al importar a "${record.name}": ${err.message}`);
        }
    }

    // Conteo final en la base de datos
    const finalCount = await prisma.person.count();

    console.log('\n' + '='.repeat(50));
    console.log('📊 RESULTADO FINAL DE LA IMPORTACIÓN ESTATAL');
    console.log('='.repeat(50));
    console.log(`   ✅ Insertados exitosamente:  ${inserted}`);
    console.log(`   ❌ Errores encontrados:      ${errors}`);
    console.log(`   📋 Total actual en BD:       ${finalCount}`);
    console.log('='.repeat(50));
    console.log('\n🎉 ¡Importación estatal completada con éxito! El Padrón de simpatizantes está activo.\n');
}

main()
    .catch((e) => {
        console.error('❌ Error crítico en importación:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
