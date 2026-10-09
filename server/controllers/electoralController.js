/**
 * controllers/electoralController.js
 * Motor de inteligencia electoral.
 *
 * Cruza los resultados del IEEC 2024 (560 secciones) con el padrón propio y
 * con la geografía del INE. El cruce con el padrón se cachea: antes se
 * recalculaba en cada petición.
 */

const prisma = require('../services/db');
const {
  MUNICIPIOS_INE, MUNICIPIOS_INEGI, ineToInegi, norm,
  getSecciones, getAgeb, getGeoMeta, demografiaCobertura
} = require('../services/electoralData');

// ── Cache del cruce con el padrón ──
let _padronCache = { at: 0, bySeccion: {}, total: 0 };
const PADRON_TTL = 60_000;

const getPadronBySeccion = async () => {
  if (Date.now() - _padronCache.at < PADRON_TTL) return _padronCache;

  const [grouped, total] = await Promise.all([
    prisma.person.groupBy({ by: ['seccion'], _count: { seccion: true } }),
    prisma.person.count()
  ]);

  const bySeccion = {};
  for (const row of grouped) {
    if (!row.seccion) continue;
    // Se indexa por número para que "0001", "1" y " 1 " coincidan.
    const num = Number(String(row.seccion).replace(/\D/g, ''));
    if (num) bySeccion[num] = (bySeccion[num] || 0) + row._count.seccion;
  }

  _padronCache = { at: Date.now(), bySeccion, total };
  return _padronCache;
};

// ── Semáforo de participación ──
const getSemaforoColor = (p) => (p < 0.55 ? 'rojo' : p < 0.70 ? 'amarillo' : 'verde');
const getSemaforoPriority = (p) => (p < 0.55 ? 'CRÍTICA' : p < 0.70 ? 'MEDIA' : 'CONSOLIDADA');

/** Meta de votos para ganar, según los parámetros que fije el estratega. */
const calcularMeta = (secciones, cfg = {}) => {
  const {
    participacion_estimada = 0.633,
    porcentaje_necesario = 0.50,
    municipios = [],
    distritos = []
  } = cfg;

  let filtradas = secciones;

  if (municipios.length) {
    const wanted = new Set(municipios.map(norm));
    filtradas = filtradas.filter(s => wanted.has(norm(s.municipio)));
  }

  if (distritos.length) {
    const geo = getGeoMeta();
    const wanted = new Set(distritos.map(Number));
    filtradas = filtradas.filter(s => wanted.has(geo[Number(s.seccion)]?.distrito_l));
  }

  const lista_nominal_total = filtradas.reduce((a, s) => a + (s.lista_nominal || 0), 0);
  const votos_historicos = filtradas.reduce((a, s) => a + (s.total_votos || 0), 0);
  const votos_esperados = Math.round(lista_nominal_total * participacion_estimada);
  const meta_votos = Math.round(votos_esperados * porcentaje_necesario) + 1;
  const votos_dormidos = filtradas.reduce(
    (a, s) => a + ((s.lista_nominal || 0) - (s.total_votos || 0)), 0
  );

  return {
    lista_nominal_total,
    votos_historicos_2024: votos_historicos,
    participacion_historica: lista_nominal_total > 0 ? votos_historicos / lista_nominal_total : 0,
    participacion_estimada,
    votos_esperados_2027: votos_esperados,
    meta_votos,
    votos_dormidos,
    porcentaje_necesario,
    secciones_count: filtradas.length
  };
};

// ───────────────────────────────────────────────────────────────────────────
// GET /api/electoral/resumen
// ───────────────────────────────────────────────────────────────────────────
const getResumen = async (req, res) => {
  try {
    const secciones = getSecciones();
    const stats = calcularMeta(secciones);
    const { total: totalPadron } = await getPadronBySeccion();

    res.json({
      ...stats,
      total_padron_registrado: totalPadron,
      cobertura_padron: stats.lista_nominal_total > 0
        ? totalPadron / stats.lista_nominal_total
        : 0,
      metadata: {
        ambito: 'Estatal — Campeche',
        municipios: Object.values(MUNICIPIOS_INE).length,
        secciones: secciones.length,
        fuente: 'IEEC 2024',
        objetivo: 'Elección 2027'
      }
    });
  } catch (err) {
    console.error('Electoral resumen error:', err);
    res.status(500).json({ error: 'Error al calcular el resumen electoral' });
  }
};

// ───────────────────────────────────────────────────────────────────────────
// GET /api/electoral/secciones
// ───────────────────────────────────────────────────────────────────────────
const getSeccionesEnriquecidas = async (req, res) => {
  try {
    const secciones = getSecciones();
    const { bySeccion } = await getPadronBySeccion();
    const geoMeta = getGeoMeta();

    const { municipio, semaforo, distrito } = req.query;

    let enriquecidas = secciones.map(s => {
      const num = Number(s.seccion);
      const geo = geoMeta[num] || {};
      const votos_dormidos = (s.lista_nominal || 0) - (s.total_votos || 0);
      const ciudadanos_registrados = bySeccion[num] || 0;

      return {
        ...s,
        votos_dormidos,
        semaforo: getSemaforoColor(s.participacion),
        prioridad: getSemaforoPriority(s.participacion),
        ciudadanos_registrados,
        cobertura_padron: s.lista_nominal > 0 ? ciudadanos_registrados / s.lista_nominal : 0,
        // Prioriza donde hay mucho voto dormido y poca participación.
        score_recuperacion: votos_dormidos * (1 - s.participacion),
        distrito_f: geo.distrito_f ?? null,
        distrito_l: geo.distrito_l ?? null,
        municipio_id: geo.municipio_ine ?? null,
        municipio_nombre: geo.municipio_nombre ?? s.municipio ?? null,
        tipo: geo.tipo ?? null,
        tipo_nombre: geo.tipo_nombre ?? null,
        lat: geo.lat ?? null,
        lng: geo.lng ?? null
      };
    });

    if (municipio) {
      const wanted = norm(municipio);
      enriquecidas = enriquecidas.filter(
        s => norm(s.municipio_nombre) === wanted || norm(s.municipio) === wanted
      );
    }
    if (semaforo) {
      enriquecidas = enriquecidas.filter(s => s.semaforo === String(semaforo).toLowerCase());
    }
    if (distrito) {
      enriquecidas = enriquecidas.filter(s => s.distrito_l === Number(distrito));
    }

    enriquecidas.sort((a, b) => b.score_recuperacion - a.score_recuperacion);
    res.json(enriquecidas);
  } catch (err) {
    console.error('Electoral secciones error:', err);
    res.status(500).json({ error: 'Error al obtener las secciones' });
  }
};

// ───────────────────────────────────────────────────────────────────────────
// GET /api/electoral/demografia/:seccion
//
// Los datos del censo que trae el proyecto son una muestra: solo cubren un
// municipio y el total estatal. Antes se devolvía siempre el mismo registro
// aunque no correspondiera a la sección pedida, lo que hacía pasar cifras de
// un municipio por las de otro. Ahora se responde con el dato que realmente
// aplica, se declara a qué nivel está agregado, y si no hay dato se dice.
// ───────────────────────────────────────────────────────────────────────────
const getDemografia = async (req, res) => {
  try {
    const seccionNum = Number(String(req.params.seccion || '').replace(/\D/g, ''));
    const geoMeta = getGeoMeta();
    const geo = geoMeta[seccionNum];

    if (!geo) {
      return res.status(404).json({
        error: `La sección ${req.params.seccion} no existe en la geografía electoral de Campeche.`,
        disponible: false
      });
    }

    const ageb = getAgeb();
    const cobertura = demografiaCobertura();

    // La clave INEGI no es la misma que la del INE: hay que traducirla.
    const munInegi = geo.municipio_inegi;

    // 1º intento: total del municipio al que pertenece la sección.
    let fuente = ageb.find(a => Number(a.MUN) === munInegi && Number(a.LOC) === 0);
    let nivel = 'MUNICIPAL';

    // 2º intento: agregado de los AGEB de ese municipio.
    if (!fuente) {
      const delMunicipio = ageb.filter(a => Number(a.MUN) === munInegi);
      if (delMunicipio.length) {
        fuente = delMunicipio.reduce((acc, row) => {
          for (const [k, v] of Object.entries(row)) {
            const n = Number(v);
            if (Number.isFinite(n) && !['ENTIDAD', 'MUN', 'LOC', 'MZA'].includes(k)) {
              acc[k] = (acc[k] || 0) + n;
            }
          }
          return acc;
        }, { NOM_MUN: MUNICIPIOS_INEGI[munInegi] });
        nivel = 'MUNICIPAL_AGREGADO';
      }
    }

    // Si no hay nada del municipio, se dice claramente en lugar de devolver
    // las cifras de otro lugar.
    if (!fuente) {
      return res.json({
        seccion: seccionNum,
        municipio: geo.municipio_nombre,
        disponible: false,
        nivel: null,
        mensaje:
          `El censo cargado no incluye a ${geo.municipio_nombre}. ` +
          `Solo hay datos de: ${cobertura.municipios.join(', ') || 'ninguno'} ` +
          `y el total estatal.`,
        cobertura,
        fuente: 'INEGI Censo 2020 (muestra parcial)'
      });
    }

    const num = (k) => Number(fuente[k]) || 0;
    const pobtot = num('POBTOT');
    const p18ymas = num('P_18YMAS');
    const tvivhab = num('TVIVHAB') || 1;
    const pct = (part, whole) => (whole > 0 ? Number(((part / whole) * 100).toFixed(1)) : null);

    res.json({
      seccion: seccionNum,
      municipio: geo.municipio_nombre,
      municipio_inegi: MUNICIPIOS_INEGI[munInegi] || null,
      distrito_local: geo.distrito_l,
      distrito_federal: geo.distrito_f,
      tipo_seccion: geo.tipo_nombre,

      disponible: true,
      // Es información del municipio, no de la sección: decirlo evita que se
      // tomen decisiones creyendo que el dato es más fino de lo que es.
      nivel,
      advertencia: 'Cifras agregadas a nivel municipal, no seccional.',

      poblacion_total: pobtot,
      mayores_18: p18ymas,
      pct_mayores_18: pct(p18ymas, pobtot),
      pea: num('PEA'),
      pct_pea: pct(num('PEA'), pobtot),
      sin_derechohabiencia: num('PSINDER'),
      pct_sin_salud: pct(num('PSINDER'), pobtot),
      analfabetismo_15mas: num('P15YM_SE'),
      pct_analfabetismo: pct(num('P15YM_SE'), num('P_15YMAS') || p18ymas),
      religion_catolica: num('PCATOLICA'),
      pct_catolicos: pct(num('PCATOLICA'), pobtot),
      adultos_mayores_60: num('P_60YMAS'),
      pct_adultos_mayores: pct(num('P_60YMAS'), pobtot),
      viviendas_con_internet: num('VPH_INTER'),
      pct_internet: pct(num('VPH_INTER'), tvivhab),
      poblacion_femenina: num('POBFEM'),
      poblacion_masculina: num('POBMAS'),

      cobertura,
      fuente: 'INEGI Censo 2020'
    });
  } catch (err) {
    console.error('Electoral demografia error:', err);
    res.status(500).json({ error: 'Error al obtener la demografía' });
  }
};

// ───────────────────────────────────────────────────────────────────────────
// GET /api/electoral/cobertura-demografica
// ───────────────────────────────────────────────────────────────────────────
const getCoberturaDemografica = async (req, res) => {
  try {
    res.json(demografiaCobertura());
  } catch (err) {
    res.status(500).json({ error: 'Error al calcular la cobertura' });
  }
};

// ───────────────────────────────────────────────────────────────────────────
// POST /api/electoral/meta
// ───────────────────────────────────────────────────────────────────────────
const calcularMetaEndpoint = async (req, res) => {
  try {
    const {
      participacion_estimada = 0.633,
      porcentaje_necesario = 0.50,
      municipios = [],
      distritos = []
    } = req.body;

    const resultado = calcularMeta(getSecciones(), {
      participacion_estimada: Number(participacion_estimada),
      porcentaje_necesario: Number(porcentaje_necesario),
      municipios, distritos
    });

    const { total: totalPadron } = await getPadronBySeccion();
    res.json({
      ...resultado,
      padron_propio: totalPadron,
      falta_para_meta: Math.max(0, resultado.meta_votos - totalPadron)
    });
  } catch (err) {
    console.error('Electoral meta error:', err);
    res.status(500).json({ error: 'Error al calcular la meta' });
  }
};

// ───────────────────────────────────────────────────────────────────────────
// GET /api/electoral/municipios — resumen por municipio
// ───────────────────────────────────────────────────────────────────────────
const getMunicipios = async (req, res) => {
  try {
    const secciones = getSecciones();
    const { bySeccion } = await getPadronBySeccion();
    const geoMeta = getGeoMeta();

    const acc = {};
    for (const s of secciones) {
      const num = Number(s.seccion);
      const nombre = geoMeta[num]?.municipio_nombre || s.municipio || 'Sin municipio';
      acc[nombre] ??= {
        municipio: nombre,
        municipio_ine: geoMeta[num]?.municipio_ine ?? null,
        municipio_inegi: geoMeta[num]?.municipio_inegi ?? null,
        secciones: 0, lista_nominal: 0, votos: 0, dormidos: 0, padron_propio: 0
      };
      const a = acc[nombre];
      a.secciones++;
      a.lista_nominal += s.lista_nominal || 0;
      a.votos += s.total_votos || 0;
      a.dormidos += (s.lista_nominal || 0) - (s.total_votos || 0);
      a.padron_propio += bySeccion[num] || 0;
    }

    const salida = Object.values(acc).map(m => ({
      ...m,
      participacion: m.lista_nominal > 0 ? m.votos / m.lista_nominal : 0,
      cobertura_padron: m.lista_nominal > 0 ? m.padron_propio / m.lista_nominal : 0
    })).sort((a, b) => b.lista_nominal - a.lista_nominal);

    res.json(salida);
  } catch (err) {
    console.error('Electoral municipios error:', err);
    res.status(500).json({ error: 'Error al agrupar por municipio' });
  }
};

// ───────────────────────────────────────────────────────────────────────────
// POST /api/electoral/ai-consult
// ───────────────────────────────────────────────────────────────────────────
const aiConsult = async (req, res) => {
  try {
    const { pregunta, puesto = 'Presidente Municipal' } = req.body;
    if (!pregunta || !String(pregunta).trim()) {
      return res.status(400).json({ error: 'Se requiere una pregunta.' });
    }
    if (String(pregunta).length > 2000) {
      return res.status(400).json({ error: 'La pregunta es demasiado larga (máximo 2000 caracteres).' });
    }

    const secciones = getSecciones();
    const stats = calcularMeta(secciones);
    const { total: totalPadron } = await getPadronBySeccion();

    const GEMINI_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_KEY) {
      const top = [...secciones]
        .map(s => ({ ...s, dormidos: (s.lista_nominal || 0) - (s.total_votos || 0) }))
        .sort((a, b) => b.dormidos - a.dormidos)
        .slice(0, 5);
      return res.json({
        respuesta:
          `El Consultor IA necesita una GEMINI_API_KEY configurada en el servidor. ` +
          `Mientras tanto, el análisis directo de los datos:\n\n` +
          `**${puesto} — Campeche 2027**\n` +
          `- Lista nominal: ${stats.lista_nominal_total.toLocaleString('es-MX')} electores\n` +
          `- Meta mínima estimada: ${stats.meta_votos.toLocaleString('es-MX')} votos\n` +
          `- Votos dormidos: ${stats.votos_dormidos.toLocaleString('es-MX')}\n` +
          `- Padrón propio capturado: ${totalPadron.toLocaleString('es-MX')}\n\n` +
          `Secciones con más voto dormido:\n` +
          top.map((s, i) =>
            `${i + 1}. Sección ${s.seccion} (${s.municipio}): ${s.dormidos.toLocaleString('es-MX')} dormidos`
          ).join('\n'),
        fuente: 'Cálculo directo (sin IA)',
        timestamp: new Date().toISOString()
      });
    }

    // Contexto acotado al municipio si la pregunta lo menciona.
    const preguntaNorm = norm(pregunta);
    let muniDetectado = null;
    for (const nombre of Object.values(MUNICIPIOS_INE)) {
      if (preguntaNorm.includes(norm(nombre))) { muniDetectado = nombre; break; }
    }

    const filtradas = muniDetectado
      ? secciones.filter(s => norm(s.municipio) === norm(muniDetectado))
      : secciones;

    const top15 = [...filtradas]
      .map(s => ({ ...s, dormidos: (s.lista_nominal || 0) - (s.total_votos || 0) }))
      .sort((a, b) => b.dormidos - a.dormidos)
      .slice(0, 15);

    // Agregados de votación para dar contexto de fuerza relativa.
    const tot = { MORENA: 0, MC: 0, PRI_PRD: 0, PAN: 0, OTROS: 0 };
    const ganadas = { MORENA: 0, MC: 0, PRI_PRD: 0, PAN: 0, OTROS: 0, SIN_DATOS: 0 };
    for (const s of secciones) {
      ganadas[s.ganador || 'SIN_DATOS'] = (ganadas[s.ganador || 'SIN_DATOS'] || 0) + 1;
      tot.MORENA += s.votos_coalicion_morena || 0;
      tot.MC += s.votos_mc || 0;
      tot.PRI_PRD += s.votos_coalicion_pri_prd || 0;
      tot.PAN += s.votos_pan || 0;
      tot.OTROS += s.votos_otros || 0;
    }
    const totalVotos = Object.values(tot).reduce((a, b) => a + b, 0) || 1;
    const pctOf = (v) => ((v / totalVotos) * 100).toFixed(1);

    const contexto = `
Eres un consultor electoral estratégico experto en campañas en México, especializado en análisis geo-electoral y movilización territorial.
Trabajas en la campaña para ${puesto} en Campeche con miras a la elección de 2027.

DATOS ELECTORALES (elección 2024, fuente IEEC):
- Secciones analizadas: ${secciones.length}
- Lista nominal: ${stats.lista_nominal_total.toLocaleString('es-MX')} electores
- Votos emitidos: ${stats.votos_historicos_2024.toLocaleString('es-MX')}
- Participación histórica: ${(stats.participacion_historica * 100).toFixed(1)}%
- Votos dormidos: ${stats.votos_dormidos.toLocaleString('es-MX')}
- Meta mínima para ganar: ${stats.meta_votos.toLocaleString('es-MX')} votos
- Padrón propio de simpatizantes capturado: ${totalPadron.toLocaleString('es-MX')}

FUERZA RELATIVA EN 2024:
1. MORENA-PT-PVEM: ${tot.MORENA.toLocaleString('es-MX')} votos (${pctOf(tot.MORENA)}%) — ganó ${ganadas.MORENA} secciones
2. Movimiento Ciudadano: ${tot.MC.toLocaleString('es-MX')} votos (${pctOf(tot.MC)}%) — ganó ${ganadas.MC} secciones
3. PRI-PRD: ${tot.PRI_PRD.toLocaleString('es-MX')} votos (${pctOf(tot.PRI_PRD)}%) — ganó ${ganadas.PRI_PRD} secciones
4. PAN: ${tot.PAN.toLocaleString('es-MX')} votos (${pctOf(tot.PAN)}%) — ganó ${ganadas.PAN} secciones
5. Otros: ${tot.OTROS.toLocaleString('es-MX')} votos (${pctOf(tot.OTROS)}%) — ganó ${ganadas.OTROS} secciones

TOP 15 SECCIONES CON MÁS VOTO DORMIDO${muniDetectado ? ` EN ${muniDetectado.toUpperCase()}` : ' (ESTATAL)'}:
${top15.map((s, i) =>
  `${i + 1}. Sección ${s.seccion} (${s.municipio}): ${s.dormidos.toLocaleString('es-MX')} dormidos, ` +
  `participación ${(s.participacion * 100).toFixed(1)}%, lista nominal ${(s.lista_nominal || 0).toLocaleString('es-MX')}, ` +
  `ganador 2024: ${s.ganador_label || 'sin datos'}`
).join('\n')}

PREGUNTA DEL ESTRATEGA:
${pregunta}

Responde en español con recomendaciones tácticas concretas, citando números de sección y municipio.
Sé directo y accionable: máximo 5 puntos clave, 300 palabras en total. Usa viñetas.`;

    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(GEMINI_KEY);

    // Modelos reales, del más capaz al más ligero. Se puede fijar uno con
    // GEMINI_MODEL. Antes la lista empezaba por identificadores inexistentes,
    // así que cada consulta gastaba una llamada fallida antes de acertar.
    const modelsToTry = process.env.GEMINI_MODEL
      ? [process.env.GEMINI_MODEL]
      : ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-pro'];

    let result = null;
    let chosenModel = '';
    let lastError = null;

    for (const modelName of modelsToTry) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        result = await model.generateContent(contexto);
        chosenModel = modelName;
        break;
      } catch (err) {
        console.error(`Gemini falló con ${modelName}: ${err.message}`);
        lastError = err;
      }
    }

    if (!result) throw lastError || new Error('Ningún modelo respondió.');

    res.json({
      respuesta: result.response.text(),
      fuente: `Gemini (${chosenModel})`,
      contexto: muniDetectado ? `Municipio: ${muniDetectado}` : 'Estatal',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Electoral AI error:', err);
    res.status(500).json({ error: 'Error en el consultor IA: ' + err.message });
  }
};

module.exports = {
  getResumen,
  getSecciones: getSeccionesEnriquecidas,
  getDemografia,
  getCoberturaDemografica,
  calcularMetaEndpoint,
  getMunicipios,
  aiConsult
};
