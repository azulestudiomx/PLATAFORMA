/**
 * services/electoralData.js
 * Carga y normaliza los datos electorales estáticos.
 *
 * Nota importante sobre catálogos de municipio: conviven DOS numeraciones
 * distintas y no son intercambiables.
 *
 *   · INE / IEEC (GeoJSON de secciones):  1 = Campeche (capital), 2 = Calkiní…
 *   · INEGI (censo, tablas AGEB):         1 = Calkiní,            2 = Campeche…
 *
 * Cruzarlas sin traducir hace que un municipio aparezca con las cifras de
 * otro. Aquí se mantienen separadas y se traduce explícitamente.
 */

const path = require('path');
const fs = require('fs');

const DATA_ROOT = path.join(__dirname, '..', '..');

// Catálogo del INE/IEEC, verificado por centroide de las secciones.
const MUNICIPIOS_INE = {
  1: 'Campeche',     2: 'Calkiní',    3: 'Carmen',     4: 'Champotón',
  5: 'Hecelchakán',  6: 'Hopelchén',  7: 'Palizada',   8: 'Tenabo',
  9: 'Escárcega',   10: 'Candelaria', 11: 'Calakmul', 12: 'Dzitbalché',
  13: 'Seybaplaya'
};

// Catálogo oficial del INEGI (orden alfabético histórico).
const MUNICIPIOS_INEGI = {
  1: 'Calkiní',      2: 'Campeche',    3: 'Carmen',     4: 'Champotón',
  5: 'Hecelchakán',  6: 'Hopelchén',   7: 'Palizada',   8: 'Tenabo',
  9: 'Escárcega',   10: 'Calakmul',   11: 'Candelaria', 12: 'Seybaplaya',
  13: 'Dzitbalché'
};

const TIPO_NOMBRES = { 1: 'Urbana', 2: 'Urbana', 3: 'Mixta', 4: 'Rural' };

const norm = (s) =>
  String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();

// Traducción entre catálogos, hecha por nombre normalizado.
const INEGI_POR_NOMBRE = Object.fromEntries(
  Object.entries(MUNICIPIOS_INEGI).map(([id, nombre]) => [norm(nombre), Number(id)])
);
const INE_POR_NOMBRE = Object.fromEntries(
  Object.entries(MUNICIPIOS_INE).map(([id, nombre]) => [norm(nombre), Number(id)])
);

/** Clave INEGI equivalente a una clave INE. */
const ineToInegi = (ineId) => INEGI_POR_NOMBRE[norm(MUNICIPIOS_INE[Number(ineId)])] ?? null;

/** Clave INE equivalente a una clave INEGI. */
const inegiToIne = (inegiId) => INE_POR_NOMBRE[norm(MUNICIPIOS_INEGI[Number(inegiId)])] ?? null;

// ── Cargas perezosas, cacheadas en memoria ──
let _secciones = null;
let _ageb = null;
let _geoMeta = null;

const getSecciones = () => {
  if (_secciones) return _secciones;
  const raw = fs.readFileSync(
    path.join(DATA_ROOT, 'campeche2027_master_completo.json'), 'utf-8'
  );
  _secciones = JSON.parse(raw).secciones || [];
  return _secciones;
};

const getAgeb = () => {
  if (_ageb) return _ageb;
  const raw = fs.readFileSync(path.join(DATA_ROOT, 'campeche2027_master.json'), 'utf-8');
  _ageb = JSON.parse(raw).ageb_preview || [];
  return _ageb;
};

/** Mapa sección → metadatos del GeoJSON del INE. */
const getGeoMeta = () => {
  if (_geoMeta) return _geoMeta;
  _geoMeta = {};
  try {
    const geo = JSON.parse(fs.readFileSync(
      path.join(DATA_ROOT, 'src', 'campeche_secciones_wgs84.json'), 'utf-8'
    ));
    for (const feat of geo.features || []) {
      const p = feat.properties || {};
      const seccion = Number(p.seccion);
      if (!seccion) continue;
      const municipioIne = Number(p.municipio);
      _geoMeta[seccion] = {
        distrito_f: Number(p.distrito_f) || null,
        distrito_l: Number(p.distrito_l) || null,
        municipio_ine: municipioIne || null,
        municipio_inegi: municipioIne ? ineToInegi(municipioIne) : null,
        municipio_nombre: MUNICIPIOS_INE[municipioIne] || null,
        tipo: Number(p.tipo) || null,
        tipo_nombre: TIPO_NOMBRES[Number(p.tipo)] || null,
        control: Number(p.control) || null
      };
    }
  } catch (err) {
    console.warn('[electoral] GeoJSON no disponible:', err.message);
  }
  return _geoMeta;
};

/**
 * Cobertura real de los datos demográficos del INEGI que trae el proyecto.
 * El archivo es una muestra, no el censo completo: conviene saber qué hay
 * antes de prometer un dato por sección.
 */
const demografiaCobertura = () => {
  const ageb = getAgeb();
  const municipiosInegi = [...new Set(ageb.map(a => Number(a.MUN)).filter(m => m > 0))];
  return {
    registros: ageb.length,
    municipios_inegi: municipiosInegi,
    municipios: municipiosInegi.map(m => MUNICIPIOS_INEGI[m]).filter(Boolean),
    tiene_total_estatal: ageb.some(a => Number(a.MUN) === 0),
    nivel_maximo: ageb.some(a => a.AGEB && a.AGEB !== '0000') ? 'AGEB' : 'MUNICIPIO',
    completo: municipiosInegi.length >= 13
  };
};

module.exports = {
  MUNICIPIOS_INE, MUNICIPIOS_INEGI, TIPO_NOMBRES,
  ineToInegi, inegiToIne, norm,
  getSecciones, getAgeb, getGeoMeta, demografiaCobertura
};
