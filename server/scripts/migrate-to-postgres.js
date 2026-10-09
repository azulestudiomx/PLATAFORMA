/**
 * scripts/migrate-to-postgres.js
 * Traslada los datos de la base SQLite heredada a PostgreSQL.
 *
 * De paso hace tres cosas que el esquema nuevo exige:
 *   1. Saca las fotos base64 de la base y las guarda en disco como WebP.
 *   2. Cifra la clave de elector y calcula su hash de búsqueda.
 *   3. Asigna a cada persona su territorio a partir del número de sección.
 *
 * Uso:  node scripts/migrate-to-postgres.js [ruta/dev.db]
 *
 * Es idempotente: vuelve a correr sin duplicar (compara por id).
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const fs = require('fs');
const Database = require('better-sqlite3');
const prisma = require('../services/db');
const { packIne } = require('../services/crypto');
const { saveImage } = require('../services/storage');
const { seedTerritories, findSeccion } = require('../services/territoryService');
const { canonical, levelOf } = require('../config/roles');

const SQLITE_PATH = process.argv[2] || path.join(__dirname, '..', 'prisma', 'dev.db');

const stats = {
  users: 0, people: 0, reports: 0, history: 0, events: 0,
  audit: 0, config: 0, images: 0, imagesFailed: 0, inesCifrados: 0
};

/** Lee una tabla completa, tolerando que no exista. */
const readTable = (db, table) => {
  try {
    return db.prepare(`SELECT * FROM "${table}"`).all();
  } catch (err) {
    console.warn(`  · tabla ${table} no disponible (${err.message})`);
    return [];
  }
};

/** Convierte los enteros/textos de SQLite a Date, o null. */
const toDate = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const d = v instanceof Date ? v : new Date(typeof v === 'number' ? v : String(v));
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Guarda una imagen base64 y devuelve su URL, o null si no era válida. */
const migrateImage = async (base64, kind, ownerType, ownerId, uploadedBy, sensitive) => {
  if (!base64) return null;
  try {
    const saved = await saveImage({
      data: base64, kind, ownerType, ownerId, uploadedBy, sensitive
    });
    if (saved) { stats.images++; return saved.url; }
    return null;
  } catch (err) {
    stats.imagesFailed++;
    console.warn(`  · imagen ${kind} de ${ownerId} no se pudo convertir: ${err.message}`);
    return null;
  }
};

const main = async () => {
  console.log('\n╭─ Migración SQLite → PostgreSQL ─────────────────────────');
  console.log(`│ origen:  ${SQLITE_PATH}`);
  console.log(`│ destino: ${process.env.DATABASE_URL?.replace(/:[^:@]*@/, ':***@')}`);
  console.log('╰─────────────────────────────────────────────────────────\n');

  if (!fs.existsSync(SQLITE_PATH)) {
    console.error(`No existe la base de origen: ${SQLITE_PATH}`);
    process.exit(1);
  }

  const db = new Database(SQLITE_PATH, { readonly: true });

  // ── 0. Árbol territorial ──
  console.log('▸ Sembrando árbol territorial…');
  await seedTerritories({ verbose: true });

  // ── 1. Campaña por defecto ──
  console.log('\n▸ Campaña por defecto…');
  let campaign = await prisma.campaign.findFirst({ where: { isDefault: true } });
  if (!campaign) {
    campaign = await prisma.campaign.create({
      data: {
        name: 'Campaña Campeche 2027',
        slug: 'campeche-2027',
        eleccion: '2027',
        cargo: 'Presidente Municipal',
        ambito: 'MUNICIPAL',
        estado: 'ACTIVA',
        isDefault: true
      }
    });
    console.log(`  creada: ${campaign.name}`);
  } else {
    console.log(`  ya existía: ${campaign.name}`);
  }

  // ── 2. Usuarios ──
  console.log('\n▸ Usuarios…');
  const estado = await prisma.territory.findUnique({
    where: { type_code: { type: 'ESTADO', code: '04' } }
  });

  for (const u of readTable(db, 'User')) {
    const role = canonical(u.role);
    await prisma.user.upsert({
      where: { username: u.username },
      update: { name: u.name, role, level: levelOf(role) },
      create: {
        id: u.id,
        username: u.username,
        password: u.password, // ya viene con hash bcrypt
        name: u.name,
        role,
        level: levelOf(role),
        campaignId: campaign.id,
        // Los administradores heredados alcanzan todo el estado.
        territoryId: levelOf(role) <= 2 ? estado?.id ?? null : null,
        active: true,
        createdAt: toDate(u.createdAt) || new Date(),
        passwordChangedAt: toDate(u.updatedAt) || new Date()
      }
    });
    stats.users++;
    console.log(`  ${u.username} → ${role} (nivel ${levelOf(role)})`);
  }

  // ── 3. Personas (padrón) ──
  console.log('\n▸ Padrón…');
  const people = readTable(db, 'Person');
  console.log(`  ${people.length} registros por migrar`);

  let done = 0;
  for (const p of people) {
    const existing = await prisma.person.findUnique({ where: { id: p.id } });
    if (existing) { done++; continue; }

    const territory = await findSeccion(p.seccion);
    const ine = packIne(p.ine);
    if (ine.ineHash) stats.inesCifrados++;

    // Si ese INE ya está en la base (duplicado en el origen), se deja sin clave
    // para no perder el registro completo por una colisión de unicidad.
    let ineFields = ine;
    if (ine.ineHash) {
      const clash = await prisma.person.findUnique({ where: { ineHash: ine.ineHash } });
      if (clash) {
        console.warn(`  · INE duplicado en ${p.name} (ya está en ${clash.id}); se guarda sin clave`);
        ineFields = { ineEnc: null, ineHash: null, ineLast4: ine.ineLast4 };
      }
    }

    const created = await prisma.person.create({
      data: {
        id: p.id,
        name: p.name,
        phone: p.phone || null,
        email: p.email || null,
        address: p.address || null,
        municipio: p.municipio || null,
        localidad: p.localidad || null,
        distrito: p.distrito || null,
        zona: p.zona || null,
        seccion: p.seccion || null,
        ...ineFields,
        birthday: p.birthday || null,
        lat: p.lat ?? null,
        lng: p.lng ?? null,
        campaignId: campaign.id,
        territoryId: territory?.id ?? null,
        synced: 1,
        createdBy: p.createdBy || null,
        createdAt: toDate(p.createdAt) || new Date(),
        updatedAt: toDate(p.updatedAt) || new Date()
      }
    });

    // Las fotos salen de la base y se guardan en disco.
    const photoUrl = await migrateImage(
      p.photo, 'PERSON_PHOTO', 'Person', created.id, p.createdBy, false
    );
    const inePhotoUrl = await migrateImage(
      p.inePhoto, 'PERSON_INE', 'Person', created.id, p.createdBy, true
    );
    if (photoUrl || inePhotoUrl) {
      await prisma.person.update({
        where: { id: created.id },
        data: { photoUrl, inePhotoUrl }
      });
    }

    stats.people++;
    done++;
    if (done % 200 === 0) console.log(`  … ${done}/${people.length}`);
  }
  console.log(`  ${stats.people} personas nuevas (${people.length - stats.people} ya estaban)`);

  // ── 4. Reportes ──
  console.log('\n▸ Reportes…');
  for (const r of readTable(db, 'Report')) {
    const existing = await prisma.report.findUnique({ where: { id: r.id } });
    if (existing) continue;

    const created = await prisma.report.create({
      data: {
        id: r.id,
        municipio: r.municipio || null,
        comunidad: r.comunidad || null,
        lat: r.lat ?? null,
        lng: r.lng ?? null,
        needType: r.needType || null,
        description: r.description || null,
        evidenceGallery: r.evidenceGallery || null,
        timestamp: r.timestamp ?? null,
        user: r.user || null,
        status: r.status || 'Pendiente',
        campaignId: campaign.id,
        syncedAt: toDate(r.syncedAt) || new Date(),
        customData: r.customData || null,
        response: r.response || null,
        resolvedAt: toDate(r.resolvedAt),
        sentiment: r.sentiment || null,
        urgency: r.urgency || null,
        assignedTo: r.assignedTo || null,
        createdAt: toDate(r.createdAt) || new Date(),
        updatedAt: toDate(r.updatedAt) || new Date()
      }
    });

    // La evidencia principal sale de evidenceBase64; la galería puede traer más.
    const evidenceUrl = await migrateImage(
      r.evidenceBase64, 'REPORT_EVIDENCE', 'Report', created.id, r.user, false
    );

    let galleryUrls = [];
    if (r.evidenceGallery) {
      try {
        const gallery = JSON.parse(r.evidenceGallery);
        if (Array.isArray(gallery)) {
          for (const img of gallery) {
            const url = await migrateImage(
              img, 'REPORT_EVIDENCE', 'Report', created.id, r.user, false
            );
            if (url) galleryUrls.push(url);
          }
        }
      } catch { /* la galería venía con otro formato: se ignora */ }
    }

    if (evidenceUrl || galleryUrls.length) {
      await prisma.report.update({
        where: { id: created.id },
        data: {
          evidenceUrl: evidenceUrl || galleryUrls[0] || null,
          evidenceGallery: galleryUrls.length ? JSON.stringify(galleryUrls) : null
        }
      });
    }
    stats.reports++;
  }
  console.log(`  ${stats.reports} reportes`);

  // ── 5. Historial de reportes ──
  console.log('\n▸ Historial de reportes…');
  for (const h of readTable(db, 'ReportHistory')) {
    const exists = await prisma.reportHistory.findUnique({ where: { id: h.id } });
    if (exists) continue;
    const parent = await prisma.report.findUnique({ where: { id: h.reportId } });
    if (!parent) continue;
    await prisma.reportHistory.create({
      data: {
        id: h.id,
        reportId: h.reportId,
        username: h.username || null,
        action: h.action,
        fromStatus: h.fromStatus || null,
        toStatus: h.toStatus || null,
        note: h.note || null,
        createdAt: toDate(h.createdAt) || new Date()
      }
    });
    stats.history++;
  }
  console.log(`  ${stats.history} entradas`);

  // ── 6. Eventos ──
  console.log('\n▸ Eventos…');
  for (const e of readTable(db, 'Event')) {
    const exists = await prisma.event.findUnique({ where: { id: e.id } });
    if (exists) continue;
    await prisma.event.create({
      data: {
        id: e.id,
        title: e.title,
        date: e.date,
        location: e.location || null,
        community: e.community || null,
        type: e.type || 'Reunión',
        description: e.description || null,
        assignedTo: e.assignedTo || null,
        campaignId: campaign.id,
        createdBy: e.createdBy || null,
        createdAt: toDate(e.createdAt) || new Date(),
        updatedAt: toDate(e.updatedAt) || new Date()
      }
    });
    stats.events++;
  }
  console.log(`  ${stats.events} eventos`);

  // ── 7. Bitácora ──
  console.log('\n▸ Bitácora…');
  for (const a of readTable(db, 'AuditLog')) {
    const exists = await prisma.auditLog.findUnique({ where: { id: a.id } });
    if (exists) continue;
    await prisma.auditLog.create({
      data: {
        id: a.id,
        username: a.username || null,
        role: a.role ? canonical(a.role) : null,
        action: a.action,
        entity: a.entity,
        entityId: a.entityId || null,
        detail: a.detail || null,
        createdAt: toDate(a.createdAt) || new Date()
      }
    });
    stats.audit++;
  }
  console.log(`  ${stats.audit} entradas`);

  // ── 8. Configuración ──
  console.log('\n▸ Configuración…');
  const configs = readTable(db, 'SystemConfig');
  if (configs.length) {
    const c = configs[0];
    const existing = await prisma.systemConfig.findFirst();
    const data = {
      primaryColor: c.primaryColor || '#8B0000',
      secondaryCol: c.secondaryCol || '#FFFFFF',
      accentColor: c.accentColor || '#FFD700',
      needTypes: c.needTypes || undefined,
      eventTypes: c.eventTypes || undefined,
      customFields: c.customFields || undefined
    };
    if (existing) await prisma.systemConfig.update({ where: { id: existing.id }, data });
    else await prisma.systemConfig.create({ data });
    stats.config = 1;
    console.log('  configuración trasladada');
  } else {
    const existing = await prisma.systemConfig.findFirst();
    if (!existing) await prisma.systemConfig.create({ data: {} });
    console.log('  configuración por defecto');
  }

  db.close();

  console.log('\n╭─ Resumen ───────────────────────────────────────────────');
  console.log(`│ usuarios:          ${stats.users}`);
  console.log(`│ personas:          ${stats.people}`);
  console.log(`│ claves cifradas:   ${stats.inesCifrados}`);
  console.log(`│ reportes:          ${stats.reports}`);
  console.log(`│ historial:         ${stats.history}`);
  console.log(`│ eventos:           ${stats.events}`);
  console.log(`│ bitácora:          ${stats.audit}`);
  console.log(`│ imágenes a disco:  ${stats.images}${stats.imagesFailed ? ` (${stats.imagesFailed} fallaron)` : ''}`);
  console.log('╰─────────────────────────────────────────────────────────\n');

  await prisma.$disconnect();
};

main().catch(async (err) => {
  console.error('\n✖ La migración falló:', err.message);
  console.error(err.stack);
  await prisma.$disconnect();
  process.exit(1);
});
