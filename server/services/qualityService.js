/**
 * services/qualityService.js
 * Control de calidad del padrón.
 *
 * En toda campaña se infla el padrón: registros inventados para cumplir una
 * meta, la misma foto reusada, capturas en ráfaga desde un escritorio. Si el
 * sistema no lo detecta, la meta se cumple en pantalla y se pierde en la urna.
 *
 * Cada detector deja una marca con su motivo. Nada se borra automáticamente:
 * un humano confirma o descarta, y esa decisión queda registrada.
 */

const prisma = require('./db');
const { MUNICIPIOS_INE, norm } = require('./electoralData');

// Umbrales de detección. Se pueden mover sin tocar la lógica.
const UMBRALES = {
  // Más de N altas del mismo usuario dentro de una ventana de M minutos.
  rafagaMin: 10,
  rafagaVentanaMin: 10,
  // Coordenadas idénticas hasta esta precisión (~11 m con 4 decimales).
  gpsDecimales: 4,
  gpsMinRepeticiones: 5,
  // Un teléfono compartido entre más de N personas distintas.
  telefonoMaxPersonas: 3,
  domicilioMaxPersonas: 6,
};

/**
 * Textos que se capturan en el campo teléfono cuando no hay número.
 * No son duplicados: son campos sin llenar disfrazados de dato.
 */
const PLACEHOLDERS = [
  'PENDIENTE', 'NO TIENE', 'NOTIENE', 'SIN NUMERO', 'SINNUMERO', 'SIN TELEFONO',
  'NO CUENTA', 'NA', 'N/A', 'NINGUNO', 'SIN DATO', 'S/D', 'X', 'XX', 'XXX', '0'
];

/** ¿Este "teléfono" es en realidad un marcador de campo vacío? */
const esPlaceholder = (valor) => {
  const t = norm(valor);
  if (!t) return true;
  if (PLACEHOLDERS.includes(t)) return true;
  // Menos de 7 dígitos no puede ser un número marcable en México.
  return t.replace(/\D/g, '').length < 7;
};

/** Registra una marca si no existe ya una igual sin resolver. */
const marcar = async ({ personId, tipo, severidad, detalle, relacionadoCon, capturadoPor }) => {
  const yaExiste = await prisma.dataQualityFlag.findFirst({
    where: { personId, tipo, estado: 'PENDIENTE' },
    select: { id: true }
  });
  if (yaExiste) return null;

  return prisma.dataQualityFlag.create({
    data: {
      personId: personId || null,
      tipo,
      severidad: severidad || 'MEDIA',
      detalle: detalle || null,
      relacionadoCon: relacionadoCon || null,
      capturadoPor: capturadoPor || null
    }
  });
};

// ───────────────────────────────────────────────────────────────────────────
// Detectores
// ───────────────────────────────────────────────────────────────────────────

/**
 * Capturas en ráfaga: muchas altas del mismo usuario en pocos minutos.
 * Una captura real en campo toma minutos por persona; 30 registros en 5
 * minutos no vienen de tocar puertas.
 */
const detectarRafagas = async () => {
  const personas = await prisma.person.findMany({
    where: { createdBy: { not: null } },
    select: { id: true, name: true, createdBy: true, createdAt: true },
    orderBy: [{ createdBy: 'asc' }, { createdAt: 'asc' }]
  });

  const ventanaMs = UMBRALES.rafagaVentanaMin * 60 * 1000;
  let marcadas = 0;

  // Ventana deslizante por usuario sobre registros ya ordenados por fecha.
  const porUsuario = {};
  for (const p of personas) {
    (porUsuario[p.createdBy] ??= []).push(p);
  }

  for (const [usuario, lista] of Object.entries(porUsuario)) {
    let inicio = 0;
    for (let fin = 0; fin < lista.length; fin++) {
      while (lista[fin].createdAt - lista[inicio].createdAt > ventanaMs) inicio++;
      const enVentana = fin - inicio + 1;

      if (enVentana >= UMBRALES.rafagaMin) {
        const minutos = Math.max(
          1,
          Math.round((lista[fin].createdAt - lista[inicio].createdAt) / 60000)
        );
        for (let i = inicio; i <= fin; i++) {
          const r = await marcar({
            personId: lista[i].id,
            tipo: 'RAFAGA',
            severidad: enVentana >= UMBRALES.rafagaMin * 2 ? 'ALTA' : 'MEDIA',
            detalle: `${enVentana} altas de ${usuario} en ${minutos} minuto(s)`,
            capturadoPor: usuario
          });
          if (r) marcadas++;
        }
        inicio = fin + 1; // no volver a marcar la misma ráfaga
      }
    }
  }

  return marcadas;
};

/**
 * Coordenadas repetidas: varios registros con el mismo GPS exacto suelen
 * significar que se capturó todo desde un solo punto.
 */
const detectarGpsDuplicado = async () => {
  const personas = await prisma.person.findMany({
    where: { lat: { not: null }, lng: { not: null } },
    select: { id: true, name: true, lat: true, lng: true, createdBy: true }
  });

  const f = UMBRALES.gpsDecimales;
  const grupos = {};
  for (const p of personas) {
    const clave = `${p.lat.toFixed(f)},${p.lng.toFixed(f)}`;
    (grupos[clave] ??= []).push(p);
  }

  let marcadas = 0;
  for (const [coord, grupo] of Object.entries(grupos)) {
    if (grupo.length < UMBRALES.gpsMinRepeticiones) continue;
    for (const p of grupo) {
      const r = await marcar({
        personId: p.id,
        tipo: 'GPS_DUPLICADO',
        severidad: grupo.length >= UMBRALES.gpsMinRepeticiones * 3 ? 'ALTA' : 'MEDIA',
        detalle: `${grupo.length} registros con la coordenada ${coord}`,
        capturadoPor: p.createdBy
      });
      if (r) marcadas++;
    }
  }
  return marcadas;
};

/**
 * Fotos reutilizadas entre personas distintas. La huella sha256 ya se calcula
 * al guardar el archivo, así que basta agrupar por ella.
 */
const detectarFotosRepetidas = async () => {
  const repetidas = await prisma.mediaAsset.groupBy({
    by: ['sha256'],
    where: { ownerType: 'Person' },
    _count: { _all: true },
    having: { sha256: { _count: { gt: 1 } } }
  });

  let marcadas = 0;
  for (const grupo of repetidas) {
    const assets = await prisma.mediaAsset.findMany({
      where: { sha256: grupo.sha256, ownerType: 'Person' },
      select: { ownerId: true, kind: true, uploadedBy: true }
    });

    // La misma foto en el mismo registro (retrato y credencial) no es problema.
    const duenos = [...new Set(assets.map(a => a.ownerId))];
    if (duenos.length < 2) continue;

    for (const a of assets) {
      const otros = duenos.filter(d => d !== a.ownerId);
      const r = await marcar({
        personId: a.ownerId,
        tipo: 'FOTO_REPETIDA',
        severidad: 'ALTA',
        detalle: `La misma imagen (${a.kind}) aparece en ${duenos.length} registros`,
        relacionadoCon: otros.slice(0, 5).join(','),
        capturadoPor: a.uploadedBy
      });
      if (r) marcadas++;
    }
  }
  return marcadas;
};

/** Un teléfono compartido por demasiadas personas distintas. */
const detectarTelefonosRepetidos = async () => {
  const grupos = await prisma.person.groupBy({
    by: ['phone'],
    where: { phone: { not: null } },
    _count: { _all: true },
    having: { phone: { _count: { gt: UMBRALES.telefonoMaxPersonas } } }
  });

  let marcadas = 0;
  for (const g of grupos) {
    // Un campo lleno con "PENDIENTE" no es un teléfono compartido:
    // eso lo reporta detectarTelefonosInvalidos, con su propia categoría.
    if (esPlaceholder(g.phone)) continue;

    // Una familia comparte teléfono; veinte personas, no.
    const personas = await prisma.person.findMany({
      where: { phone: g.phone },
      select: { id: true, name: true, createdBy: true }
    });
    for (const p of personas) {
      const r = await marcar({
        personId: p.id,
        tipo: 'TELEFONO_REPETIDO',
        severidad: personas.length > UMBRALES.telefonoMaxPersonas * 3 ? 'ALTA' : 'BAJA',
        detalle: `El teléfono ${g.phone} aparece en ${personas.length} registros`,
        capturadoPor: p.createdBy
      });
      if (r) marcadas++;
    }
  }
  return marcadas;
};

/**
 * Campos de teléfono llenados con texto en lugar de un número.
 * Un padrón con "PENDIENTE" en el teléfono no sirve para movilizar: esas
 * personas no son contactables el día de la elección.
 */
const detectarTelefonosInvalidos = async () => {
  const personas = await prisma.person.findMany({
    where: { phone: { not: null }, NOT: { phone: '' } },
    select: { id: true, phone: true, createdBy: true }
  });

  let marcadas = 0;
  for (const p of personas) {
    if (!esPlaceholder(p.phone)) continue;
    const r = await marcar({
      personId: p.id,
      tipo: 'TELEFONO_INVALIDO',
      severidad: 'MEDIA',
      detalle: `El teléfono dice "${p.phone}": no es un número contactable`,
      capturadoPor: p.createdBy
    });
    if (r) marcadas++;
  }
  return marcadas;
};

/**
 * Secciones que no existen en la geografía electoral, y municipios que en
 * realidad son localidades capturadas en el campo equivocado.
 */
const detectarTerritorioInvalido = async () => {
  let marcadas = 0;

  // Sección declarada que no corresponde a ningún territorio real.
  const sinTerritorio = await prisma.person.findMany({
    where: {
      territoryId: null,
      seccion: { not: null },
      NOT: { seccion: '' }
    },
    select: { id: true, seccion: true, createdBy: true }
  });

  for (const p of sinTerritorio) {
    const r = await marcar({
      personId: p.id,
      tipo: 'SECCION_INVALIDA',
      severidad: 'ALTA',
      detalle: `La sección "${p.seccion}" no existe en el catálogo electoral de Campeche`,
      capturadoPor: p.createdBy
    });
    if (r) marcadas++;
  }

  // Municipio que no está en el catálogo oficial (suele ser una localidad).
  const catalogo = new Set(Object.values(MUNICIPIOS_INE).map(norm));
  const municipios = await prisma.person.groupBy({
    by: ['municipio'],
    where: { municipio: { not: null } },
    _count: { _all: true }
  });

  for (const m of municipios) {
    if (!m.municipio || catalogo.has(norm(m.municipio))) continue;
    const personas = await prisma.person.findMany({
      where: { municipio: m.municipio },
      select: { id: true, createdBy: true }
    });
    for (const p of personas) {
      const r = await marcar({
        personId: p.id,
        tipo: 'MUNICIPIO_INVALIDO',
        severidad: 'MEDIA',
        detalle: `"${m.municipio}" no es un municipio de Campeche; parece una localidad`,
        capturadoPor: p.createdBy
      });
      if (r) marcadas++;
    }
  }

  return marcadas;
};

/**
 * Coherencia entre la sección declarada y la ubicación capturada.
 * Si el GPS cae a más de ~15 km del centroide de su sección, algo no cuadra.
 */
const detectarSeccionIncoherente = async () => {
  const personas = await prisma.person.findMany({
    where: { lat: { not: null }, lng: { not: null }, territoryId: { not: null } },
    select: {
      id: true, lat: true, lng: true, seccion: true, createdBy: true,
      territory: { select: { lat: true, lng: true, code: true } }
    }
  });

  // Distancia aproximada en km entre dos coordenadas (fórmula de Haversine).
  const distanciaKm = (aLat, aLng, bLat, bLng) => {
    const R = 6371;
    const rad = (d) => (d * Math.PI) / 180;
    const dLat = rad(bLat - aLat);
    const dLng = rad(bLng - aLng);
    const h = Math.sin(dLat / 2) ** 2 +
      Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };

  let marcadas = 0;
  for (const p of personas) {
    const t = p.territory;
    if (!t?.lat || !t?.lng) continue;
    const km = distanciaKm(p.lat, p.lng, t.lat, t.lng);
    if (km <= 15) continue;

    const r = await marcar({
      personId: p.id,
      tipo: 'SECCION_INCOHERENTE',
      severidad: km > 50 ? 'ALTA' : 'MEDIA',
      detalle: `La ubicación está a ${km.toFixed(1)} km del centro de la sección ${t.code}`,
      capturadoPor: p.createdBy
    });
    if (r) marcadas++;
  }
  return marcadas;
};

// ───────────────────────────────────────────────────────────────────────────
// Ejecución completa
// ───────────────────────────────────────────────────────────────────────────

const ejecutarAnalisis = async () => {
  const resultados = {
    rafagas: await detectarRafagas(),
    gpsDuplicado: await detectarGpsDuplicado(),
    fotosRepetidas: await detectarFotosRepetidas(),
    telefonosRepetidos: await detectarTelefonosRepetidos(),
    telefonosInvalidos: await detectarTelefonosInvalidos(),
    territorioInvalido: await detectarTerritorioInvalido(),
    seccionIncoherente: await detectarSeccionIncoherente()
  };
  resultados.total = Object.values(resultados).reduce((a, b) => a + b, 0);
  return resultados;
};

/**
 * Índice de confianza por capturista: qué proporción de lo que registró
 * quedó marcado. Es lo que permite distinguir a quien trabaja de quien infla.
 */
const confianzaPorCapturista = async () => {
  const [porUsuario, marcasPorUsuario] = await Promise.all([
    prisma.person.groupBy({
      by: ['createdBy'],
      where: { createdBy: { not: null } },
      _count: { _all: true }
    }),
    prisma.dataQualityFlag.groupBy({
      by: ['capturadoPor'],
      where: { capturadoPor: { not: null }, estado: { in: ['PENDIENTE', 'CONFIRMADO'] } },
      _count: { _all: true }
    })
  ]);

  const marcas = Object.fromEntries(
    marcasPorUsuario.map(m => [m.capturadoPor, m._count._all])
  );

  return porUsuario
    .map(u => {
      const total = u._count._all;
      const marcados = marcas[u.createdBy] || 0;
      // Una marca puede repetirse sobre la misma persona por motivos
      // distintos, así que el cociente se acota a 1.
      const proporcion = total > 0 ? Math.min(1, marcados / total) : 0;
      return {
        usuario: u.createdBy,
        capturas: total,
        marcas: marcados,
        proporcionMarcada: proporcion,
        confianza: Math.round((1 - proporcion) * 100),
        nivel: proporcion >= 0.5 ? 'CRÍTICO' : proporcion >= 0.2 ? 'REVISAR' : 'NORMAL'
      };
    })
    .sort((a, b) => a.confianza - b.confianza);
};

/** Resumen para el tablero de calidad. */
const resumen = async () => {
  const [porTipo, porSeveridad, porEstado, total, personasMarcadas] = await Promise.all([
    prisma.dataQualityFlag.groupBy({ by: ['tipo'], _count: { _all: true } }),
    prisma.dataQualityFlag.groupBy({ by: ['severidad'], _count: { _all: true } }),
    prisma.dataQualityFlag.groupBy({ by: ['estado'], _count: { _all: true } }),
    prisma.dataQualityFlag.count(),
    prisma.person.count({ where: { qualityFlags: { some: { estado: 'PENDIENTE' } } } })
  ]);

  const totalPadron = await prisma.person.count();

  return {
    totalMarcas: total,
    personasMarcadas,
    totalPadron,
    proporcionAfectada: totalPadron > 0 ? personasMarcadas / totalPadron : 0,
    porTipo: porTipo.map(t => ({ tipo: t.tipo, total: t._count._all }))
      .sort((a, b) => b.total - a.total),
    porSeveridad: porSeveridad.map(s => ({ severidad: s.severidad, total: s._count._all })),
    porEstado: porEstado.map(e => ({ estado: e.estado, total: e._count._all }))
  };
};

module.exports = {
  UMBRALES, marcar, ejecutarAnalisis, confianzaPorCapturista, resumen,
  detectarRafagas, detectarGpsDuplicado, detectarFotosRepetidas,
  detectarTelefonosRepetidos, detectarTelefonosInvalidos,
  detectarTerritorioInvalido, detectarSeccionIncoherente,
  esPlaceholder
};
