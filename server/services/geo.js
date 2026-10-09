/**
 * services/geo.js
 * Cálculos geográficos compartidos.
 */

const R_TIERRA_KM = 6371;

const rad = (grados) => (grados * Math.PI) / 180;

/** Distancia en kilómetros entre dos coordenadas (Haversine). */
const distanciaKm = (aLat, aLng, bLat, bLng) => {
  if ([aLat, aLng, bLat, bLng].some(v => v === null || v === undefined || Number.isNaN(v))) {
    return null;
  }
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_TIERRA_KM * Math.asin(Math.sqrt(h));
};

/**
 * Radio de tolerancia por tipo de territorio, en kilómetros.
 * Una sección urbana cabe en un par de calles; una rural puede abarcar
 * decenas de kilómetros, así que exigir el mismo radio a ambas marcaría
 * como "fuera de zona" a quien sí está trabajando.
 */
const RADIO_POR_TIPO = {
  SECCION: { Urbana: 3, Mixta: 8, Rural: 20, default: 10 },
  MUNICIPIO: { default: 45 },
  DISTRITO_L: { default: 80 },
  DISTRITO_F: { default: 120 },
  ESTADO: { default: 400 },
};

/** Radio aceptable para dar por bueno un check-in en ese territorio. */
const radioTolerancia = (territory) => {
  if (!territory) return 25;
  const porTipo = RADIO_POR_TIPO[territory.type];
  if (!porTipo) return 25;
  return porTipo[territory.tipoSeccion] ?? porTipo.default;
};

/**
 * ¿El punto cae dentro del territorio asignado?
 * Devuelve también la distancia, para poder explicar por qué no.
 */
const dentroDeTerritorio = (lat, lng, territory) => {
  if (!territory?.lat || !territory?.lng || lat == null || lng == null) {
    return { dentro: false, km: null, radio: null, motivo: 'Sin coordenadas de referencia' };
  }
  const km = distanciaKm(lat, lng, territory.lat, territory.lng);
  const radio = radioTolerancia(territory);
  return {
    dentro: km !== null && km <= radio,
    km: km === null ? null : Number(km.toFixed(2)),
    radio,
    motivo: km === null ? 'No se pudo calcular la distancia'
      : km <= radio ? null
      : `A ${km.toFixed(1)} km del centro de ${territory.name} (tolerancia ${radio} km)`,
  };
};

module.exports = { distanciaKm, radioTolerancia, dentroDeTerritorio, RADIO_POR_TIPO };
