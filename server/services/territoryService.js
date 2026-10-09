/**
 * services/territoryService.js
 * Construye y consulta el árbol territorial.
 *
 * La jerarquía es ESTADO → DISTRITO_L → MUNICIPIO → SECCION. Se siembra desde
 * los datos reales del IEEC (560 secciones con lista nominal y votación) y del
 * GeoJSON del INE (distrito federal y local, tipo de sección, centroide).
 */

const path = require('path');
const fs = require('fs');
const prisma = require('./db');

const DATA_ROOT = path.join(__dirname, '..', '..');

const MUNICIPIO_NOMBRES = {
  1: 'Campeche',     2: 'Calkiní',    3: 'Carmen',     4: 'Champotón',
  5: 'Hecelchakán',  6: 'Hopelchén',  7: 'Palizada',   8: 'Tenabo',
  9: 'Escárcega',   10: 'Candelaria', 11: 'Calakmul', 12: 'Dzitbalché',
  13: 'Seybaplaya'
};

const TIPO_SECCION = { 1: 'Urbana', 2: 'Urbana', 3: 'Mixta', 4: 'Rural' };

/** Normaliza un nombre para comparar sin acentos ni mayúsculas. */
const norm = (s) =>
  String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();

/** Centroide aproximado de un polígono GeoJSON. */
const centroidOf = (geometry) => {
  if (!geometry) return null;
  const rings =
    geometry.type === 'Polygon' ? geometry.coordinates
    : geometry.type === 'MultiPolygon' ? geometry.coordinates.flat()
    : null;
  if (!rings || !rings[0]) return null;

  let sx = 0, sy = 0, n = 0;
  for (const [x, y] of rings[0]) {
    if (Number.isFinite(x) && Number.isFinite(y)) { sx += x; sy += y; n++; }
  }
  return n ? { lng: sx / n, lat: sy / n } : null;
};

/** Metadatos por sección leídos del GeoJSON del INE. */
const readGeoMeta = () => {
  const meta = {};
  try {
    const geoPath = path.join(DATA_ROOT, 'src', 'campeche_secciones_wgs84.json');
    const geo = JSON.parse(fs.readFileSync(geoPath, 'utf-8'));
    for (const feat of geo.features || []) {
      const p = feat.properties || {};
      const seccion = Number(p.seccion);
      if (!seccion) continue;
      const c = centroidOf(feat.geometry);
      meta[seccion] = {
        distritoF: Number(p.distrito_f) || null,
        distritoL: Number(p.distrito_l) || null,
        municipioId: Number(p.municipio) || null,
        tipoSeccion: TIPO_SECCION[Number(p.tipo)] || null,
        lat: c?.lat ?? null,
        lng: c?.lng ?? null
      };
    }
  } catch (err) {
    console.warn('[territorio] GeoJSON no disponible:', err.message);
  }
  return meta;
};

/** Secciones con resultados electorales del IEEC. */
const readSecciones = () => {
  try {
    const raw = fs.readFileSync(
      path.join(DATA_ROOT, 'campeche2027_master_completo.json'), 'utf-8'
    );
    return JSON.parse(raw).secciones || [];
  } catch (err) {
    console.warn('[territorio] Datos electorales no disponibles:', err.message);
    return [];
  }
};

/**
 * Siembra el árbol territorial completo. Es idempotente: se puede correr
 * muchas veces y solo actualiza lo que cambió.
 */
const seedTerritories = async ({ verbose = true } = {}) => {
  const log = (...a) => verbose && console.log(...a);

  const geoMeta = readGeoMeta();
  const secciones = readSecciones();

  // ── Nivel 1: estado ──
  const estado = await prisma.territory.upsert({
    where: { type_code: { type: 'ESTADO', code: '04' } },
    update: { name: 'Campeche' },
    create: { type: 'ESTADO', code: '04', name: 'Campeche', path: '', depth: 0 }
  });
  log('  estado: Campeche');

  // ── Nivel 2: distritos locales (los que aparezcan en el GeoJSON) ──
  const distritoIds = new Set(
    Object.values(geoMeta).map(m => m.distritoL).filter(Boolean)
  );
  const distritoMap = {};
  for (const d of [...distritoIds].sort((a, b) => a - b)) {
    const code = String(d).padStart(2, '0');
    const t = await prisma.territory.upsert({
      where: { type_code: { type: 'DISTRITO_L', code } },
      update: { name: `Distrito Local ${d}`, parentId: estado.id },
      create: {
        type: 'DISTRITO_L', code, name: `Distrito Local ${d}`,
        parentId: estado.id, distritoL: d,
        path: estado.id, depth: 1
      }
    });
    distritoMap[d] = t;
  }
  log(`  distritos locales: ${Object.keys(distritoMap).length}`);

  // ── Nivel 3: municipios ──
  // Cada municipio se cuelga del distrito local donde tiene más secciones.
  const municipioDistrito = {};
  for (const meta of Object.values(geoMeta)) {
    if (!meta.municipioId || !meta.distritoL) continue;
    municipioDistrito[meta.municipioId] ??= {};
    municipioDistrito[meta.municipioId][meta.distritoL] =
      (municipioDistrito[meta.municipioId][meta.distritoL] || 0) + 1;
  }

  const municipioMap = {};
  for (const [idStr, nombre] of Object.entries(MUNICIPIO_NOMBRES)) {
    const id = Number(idStr);
    const counts = municipioDistrito[id] || {};
    const mainDistrito = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
    const parent = mainDistrito ? distritoMap[Number(mainDistrito)] : null;
    const parentNode = parent || estado;

    const t = await prisma.territory.upsert({
      where: { type_code: { type: 'MUNICIPIO', code: String(id) } },
      update: { name: nombre, parentId: parentNode.id },
      create: {
        type: 'MUNICIPIO', code: String(id), name: nombre,
        parentId: parentNode.id,
        path: parentNode.path ? `${parentNode.path}/${parentNode.id}` : parentNode.id,
        depth: parentNode.depth + 1
      }
    });
    municipioMap[id] = t;
    municipioMap[norm(nombre)] = t;
  }
  log(`  municipios: ${Object.keys(MUNICIPIO_NOMBRES).length}`);

  // ── Nivel 4: secciones ──
  let creadas = 0;
  for (const s of secciones) {
    const num = Number(s.seccion);
    if (!num) continue;
    const code = String(num).padStart(4, '0');
    const meta = geoMeta[num] || {};

    // El municipio sale del GeoJSON; si falta, del nombre en los datos del IEEC.
    const muni =
      (meta.municipioId && municipioMap[meta.municipioId]) ||
      municipioMap[norm(s.municipio)] ||
      estado;

    const data = {
      name: `Sección ${code}`,
      parentId: muni.id,
      listaNominal: Number(s.lista_nominal) || null,
      casillas: Number(s.casillas) || null,
      tipoSeccion: meta.tipoSeccion || null,
      distritoF: meta.distritoF || null,
      distritoL: meta.distritoL || null,
      lat: meta.lat, lng: meta.lng,
      path: muni.path ? `${muni.path}/${muni.id}` : muni.id,
      depth: muni.depth + 1
    };

    await prisma.territory.upsert({
      where: { type_code: { type: 'SECCION', code } },
      update: data,
      create: { type: 'SECCION', code, ...data }
    });
    creadas++;
  }
  log(`  secciones: ${creadas}`);

  const total = await prisma.territory.count();
  log(`✅ Árbol territorial: ${total} nodos`);
  return { total, secciones: creadas };
};

/** Busca el territorio de una sección por su número, en cualquier formato. */
const findSeccion = async (seccion) => {
  const num = Number(String(seccion || '').replace(/\D/g, ''));
  if (!num) return null;
  return prisma.territory.findUnique({
    where: { type_code: { type: 'SECCION', code: String(num).padStart(4, '0') } }
  });
};

/** Árbol completo listo para pintar un selector en la interfaz. */
const getTree = async ({ maxDepth = 3 } = {}) => {
  const nodes = await prisma.territory.findMany({
    where: { depth: { lte: maxDepth } },
    select: {
      id: true, type: true, code: true, name: true, parentId: true,
      depth: true, listaNominal: true
    },
    orderBy: [{ depth: 'asc' }, { name: 'asc' }]
  });

  const byId = new Map(nodes.map(n => [n.id, { ...n, children: [] }]));
  const roots = [];
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
};

module.exports = {
  seedTerritories, findSeccion, getTree, MUNICIPIO_NOMBRES, norm
};
