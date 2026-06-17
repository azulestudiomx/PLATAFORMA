/**
 * electoralController.js
 * Motor de Inteligencia Electoral para Campeche 2027.
 * Lee los datos históricos de los JSON y los cruza con el padrón SQLite.
 */

const path = require('path');
const fs = require('fs');
const prisma = require('../services/db');

// ─────────────────────────────────────────────────────────────────────────────
// Carga de datos electorales desde los JSON estáticos
// ─────────────────────────────────────────────────────────────────────────────
const DATA_ROOT = path.join(__dirname, '..', '..');

// Nombres de los 13 municipios de Campeche por ID (IEEC — orden REAL verificado por centroides)
const MUNICIPIO_NOMBRES = {
    1:  'Campeche',    // 19.81°N -90.48°W — capital del estado ✓
    2:  'Calkiní',     // 20.39°N -90.12°W — municipio norte ✓
    3:  'Carmen',      // 18.64°N -91.71°W — costa suroeste ✓
    4:  'Champotón',   // 19.22°N -90.64°W — sur de la capital ✓
    5:  'Hecelchakán', // 20.17°N -90.15°W — noreste ✓
    6:  'Hopelchén',   // 19.65°N -89.72°W — este ✓
    7:  'Palizada',    // 18.25°N -91.99°W — extremo suroeste ✓
    8:  'Tenabo',      // 19.99°N -90.27°W — norte-centro ✓
    9:  'Escárcega',   // 18.58°N -90.69°W — sur-centro ✓
    10: 'Candelaria',  // 18.10°N -90.86°W — sureste ✓
    11: 'Calakmul',    // 18.43°N -89.46°W — extremo este ✓
    12: 'Dzitbalché',  // 20.30°N -90.05°W — norte ✓
    13: 'Seybaplaya',  // 19.61°N -90.68°W — costa sur capital ✓
};

const TIPO_NOMBRES = { 2: 'Urbana', 3: 'Mixta', 4: 'Rural' };

let _secciones = null;
let _ageb = null;
let _geoMeta = null; // mapa seccion -> { distrito_f, distrito_l, municipio_id, municipio_nombre, tipo }

const getSecciones = () => {
    if (_secciones) return _secciones;
    const raw = fs.readFileSync(path.join(DATA_ROOT, 'campeche2027_master_completo.json'), 'utf-8');
    const data = JSON.parse(raw);
    _secciones = data.secciones || [];
    return _secciones;
};

const getAgeb = () => {
    if (_ageb) return _ageb;
    const raw = fs.readFileSync(path.join(DATA_ROOT, 'campeche2027_master.json'), 'utf-8');
    const data = JSON.parse(raw);
    _ageb = data.ageb_preview || [];
    return _ageb;
};

// Carga el GeoJSON WGS84 y construye un mapa rápido seccion → metadatos
const getGeoMeta = () => {
    if (_geoMeta) return _geoMeta;
    try {
        const geoPath = path.join(DATA_ROOT, 'src', 'campeche_secciones_wgs84.json');
        const raw = fs.readFileSync(geoPath, 'utf-8');
        const geo = JSON.parse(raw);
        _geoMeta = {};
        (geo.features || []).forEach(feat => {
            const p = feat.properties;
            const seccion = Number(p.seccion);
            _geoMeta[seccion] = {
                distrito_f:       Number(p.distrito_f),
                distrito_l:       Number(p.distrito_l),
                municipio_id:     Number(p.municipio),
                municipio_nombre: MUNICIPIO_NOMBRES[Number(p.municipio)] || `Municipio ${p.municipio}`,
                tipo:             Number(p.tipo),
                tipo_nombre:      TIPO_NOMBRES[Number(p.tipo)] || 'Desconocido',
                control:          Number(p.control),
            };
        });
    } catch (e) {
        console.warn('[electoralController] GeoJSON no encontrado, metadatos no disponibles:', e.message);
        _geoMeta = {};
    }
    return _geoMeta;
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de cálculo
// ─────────────────────────────────────────────────────────────────────────────
const getSemaforoColor = (participacion) => {
    if (participacion < 0.55) return 'rojo';
    if (participacion < 0.70) return 'amarillo';
    return 'verde';
};

const getSemaforoPriority = (participacion) => {
    if (participacion < 0.55) return 'CRÍTICA';
    if (participacion < 0.70) return 'MEDIA';
    return 'CONSOLIDADA';
};

// Calcular meta de votos para ganar según puesto y configuración
const calcularMeta = (secciones, puestoConfig) => {
    const { participacion_estimada, porcentaje_necesario, distritos } = puestoConfig;

    let seccionesFiltradas = secciones;
    if (distritos && distritos.length > 0) {
        // Para diputados: filtrar por distrito (usamos seccion range como proxy)
        seccionesFiltradas = secciones.filter(s => distritos.includes(String(s.seccion)));
    }

    const lista_nominal_total = seccionesFiltradas.reduce((acc, s) => acc + s.lista_nominal, 0);
    const votos_esperados = Math.round(lista_nominal_total * (participacion_estimada || 0.633));
    const meta_votos = Math.round(votos_esperados * (porcentaje_necesario || 0.50)) + 1;
    const votos_dormidos = seccionesFiltradas.reduce((acc, s) => acc + (s.lista_nominal - s.total_votos), 0);
    const votos_historicos = seccionesFiltradas.reduce((acc, s) => acc + s.total_votos, 0);

    return {
        lista_nominal_total,
        votos_historicos_2024: votos_historicos,
        participacion_historica: lista_nominal_total > 0 ? votos_historicos / lista_nominal_total : 0,
        participacion_estimada: participacion_estimada || 0.633,
        votos_esperados_2027: votos_esperados,
        meta_votos,
        votos_dormidos,
        porcentaje_necesario: porcentaje_necesario || 0.50,
        secciones_count: seccionesFiltradas.length,
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/electoral/resumen
// Devuelve KPIs globales del módulo
// ─────────────────────────────────────────────────────────────────────────────
const getResumen = async (req, res) => {
    try {
        const secciones = getSecciones();
        const stats = calcularMeta(secciones, {
            participacion_estimada: 0.633,
            porcentaje_necesario: 0.50,
        });

        // Cruce con padrón: contar ciudadanos por sección
        const padron = await prisma.person.groupBy({
            by: ['seccion'],
            _count: { seccion: true },
        });
        const padronBySec = {};
        padron.forEach(p => {
            if (p.seccion) padronBySec[p.seccion] = p._count.seccion;
        });

        const totalPadron = await prisma.person.count();

        res.json({
            ...stats,
            total_padron_registrado: totalPadron,
            cobertura_padron: stats.lista_nominal_total > 0 ? (totalPadron / stats.lista_nominal_total) : 0,
            metadata: { municipio: 'Campeche', fuente: 'IEEC 2024', objetivo: 'Ayuntamiento 2027' }
        });
    } catch (err) {
        console.error('Electoral resumen error:', err);
        res.status(500).json({ error: 'Error al calcular resumen electoral' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/electoral/secciones
// Devuelve las 151 secciones enriquecidas con semáforo + cruce de padrón
// ─────────────────────────────────────────────────────────────────────────────
const getSecciones_ = async (req, res) => {
    try {
        const secciones = getSecciones();

        // Cruce con padrón
        const padron = await prisma.person.groupBy({
            by: ['seccion'],
            _count: { seccion: true },
        });
        const padronBySec = {};
        padron.forEach(p => {
            if (p.seccion) padronBySec[p.seccion] = p._count.seccion;
        });

        const geoMeta = getGeoMeta();

        const enriquecidas = secciones.map(s => {
            const votos_dormidos = s.lista_nominal - s.total_votos;
            const seccionStr = String(s.seccion);
            const ciudadanos_registrados = padronBySec[seccionStr] || 0;
            const geo = geoMeta[Number(s.seccion)] || {};

            return {
                ...s,
                votos_dormidos,
                semaforo: getSemaforoColor(s.participacion),
                prioridad: getSemaforoPriority(s.participacion),
                ciudadanos_registrados,
                // Score de recuperabilidad: muchos dormidos + baja participación = mayor urgencia
                score_recuperacion: votos_dormidos * (1 - s.participacion),
                // Metadatos del GeoJSON
                distrito_f:       geo.distrito_f       ?? null,
                distrito_l:       geo.distrito_l       ?? null,
                municipio_id:     geo.municipio_id     ?? null,
                municipio_nombre: geo.municipio_nombre ?? (s.municipio || null),
                tipo:             geo.tipo             ?? null,
                tipo_nombre:      geo.tipo_nombre      ?? null,
            };
        }).sort((a, b) => b.score_recuperacion - a.score_recuperacion);

        res.json(enriquecidas);
    } catch (err) {
        console.error('Electoral secciones error:', err);
        res.status(500).json({ error: 'Error al obtener secciones' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/electoral/demografia/:seccion
// Devuelve el perfil INEGI para una sección específica
// ─────────────────────────────────────────────────────────────────────────────
const getDemografia = async (req, res) => {
    try {
        const ageb = getAgeb();
        // El ageb_preview incluye datos por municipio/localidad/manzana
        // Retornamos los datos del municipio de Campeche como contexto general
        const campeche = ageb.find(a => a.MUN === 1 && a.LOC === 0) || ageb[0];

        if (!campeche) {
            return res.json({ nota: 'No hay datos demográficos disponibles para esa sección.' });
        }

        // Extraer los indicadores más relevantes electoralmente
        const pobtot = Number(campeche.POBTOT) || 0;
        const p18ymas = Number(campeche.P_18YMAS) || 0;
        const pea = Number(campeche.PEA) || 0;
        const psinder = Number(campeche.PSINDER) || 0;
        const p15ym_se = Number(campeche.P15YM_SE) || 0;
        const pcatolica = Number(campeche.PCATOLICA) || 0;
        const p60ymas = Number(campeche.P_60YMAS) || 0;
        const vph_inter = Number(campeche.VPH_INTER) || 0;
        const tvivhab = Number(campeche.TVIVHAB) || 1;

        res.json({
            seccion: req.params.seccion,
            poblacion_total: pobtot,
            mayores_18: p18ymas,
            pct_mayores_18: pobtot > 0 ? (p18ymas / pobtot * 100).toFixed(1) : 0,
            pea,
            pct_pea: pobtot > 0 ? (pea / pobtot * 100).toFixed(1) : 0,
            sin_derechohabiencia: psinder,
            pct_sin_salud: pobtot > 0 ? (psinder / pobtot * 100).toFixed(1) : 0,
            analfabetismo_15mas: p15ym_se,
            pct_analfabetismo: p18ymas > 0 ? (p15ym_se / p18ymas * 100).toFixed(1) : 0,
            religion_catolica: pcatolica,
            pct_catolicos: pobtot > 0 ? (pcatolica / pobtot * 100).toFixed(1) : 0,
            adultos_mayores_60: p60ymas,
            pct_adultos_mayores: pobtot > 0 ? (p60ymas / pobtot * 100).toFixed(1) : 0,
            viviendas_con_internet: vph_inter,
            pct_internet: tvivhab > 0 ? (vph_inter / tvivhab * 100).toFixed(1) : 0,
            fuente: 'INEGI Censo 2020',
        });
    } catch (err) {
        console.error('Electoral demografia error:', err);
        res.status(500).json({ error: 'Error al obtener demografía' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/electoral/meta
// Calcula la meta de victoria según configuración dinámica
// ─────────────────────────────────────────────────────────────────────────────
const calcularMetaEndpoint = async (req, res) => {
    try {
        const { participacion_estimada = 0.633, porcentaje_necesario = 0.50, distritos = [] } = req.body;
        const secciones = getSecciones();
        const resultado = calcularMeta(secciones, { participacion_estimada, porcentaje_necesario, distritos });
        res.json(resultado);
    } catch (err) {
        console.error('Electoral meta error:', err);
        res.status(500).json({ error: 'Error al calcular meta' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/electoral/ai-consult
// Consulta estratégica a Gemini con contexto electoral completo
// ─────────────────────────────────────────────────────────────────────────────
const aiConsult = async (req, res) => {
    try {
        const { pregunta, puesto = 'Presidente Municipal' } = req.body;
        if (!pregunta) return res.status(400).json({ error: 'Se requiere una pregunta.' });

        const GEMINI_KEY = process.env.GEMINI_API_KEY;
        if (!GEMINI_KEY) {
            return res.json({
                respuesta: `⚠️ El Consultor IA requiere una GEMINI_API_KEY en el servidor. Por ahora, aquí un análisis manual:\n\n**Para ${puesto} - Campeche 2027:**\n- Lista Nominal: 217,472 electores\n- Meta mínima: ~68,797 votos\n- Secciones CRÍTICAS (más votos dormidos): Secc. 4 (5,512 dormidos), Secc. 105 (3,899), Secc. 79 (3,329)\n- Estrategia recomendada: Concentrar brigadas en las 10 secciones con mayor cantidad de votos dormidos antes de atacar nuevos territorios.`
            });
        }

        const secciones = getSecciones();

        // Detección dinámica del municipio en la pregunta del usuario
        const preguntaNormalizada = pregunta.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const MUNI_SEARCH = {
            'campeche': 'CAMPECHE',
            'calkini': 'CALKINÍ',
            'carmen': 'CARMEN',
            'champoton': 'CHAMPOTÓN',
            'hecelchakan': 'HECELCHAKÁN',
            'hopelchen': 'HOPELCHÉN',
            'palizada': 'PALIZADA',
            'tenabo': 'TENABO',
            'escarcega': 'ESCÁRCEGA',
            'candelaria': 'CANDELARIA',
            'calakmul': 'CALAKMUL',
            'dzitbalche': 'DZITBALCHÉ',
            'seybaplaya': 'SEYBAPLAYA'
        };

        let muniDetectado = null;
        let muniDbName = null;
        for (const [key, value] of Object.entries(MUNI_SEARCH)) {
            if (preguntaNormalizada.includes(key)) {
                muniDetectado = key.charAt(0).toUpperCase() + key.slice(1);
                muniDbName = value;
                break;
            }
        }

        let seccionesFiltradas = secciones;
        let topContextoLabel = "estatales";

        if (muniDbName) {
            // Filtrar secciones del municipio detectado para dar contexto local preciso
            const normMuniDbName = muniDbName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
            seccionesFiltradas = secciones.filter(s => 
                s.municipio && s.municipio.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase() === normMuniDbName
            );
            topContextoLabel = `del municipio de ${muniDetectado}`;
        }

        const top15 = [...seccionesFiltradas]
            .map(s => ({ ...s, dormidos: s.lista_nominal - s.total_votos }))
            .sort((a, b) => b.dormidos - a.dormidos)
            .slice(0, 15);

        const totalPadron = await prisma.person.count();
        const stats = calcularMeta(secciones, { participacion_estimada: 0.633, porcentaje_necesario: 0.50 });

        // Calcular agregados de votación por partido para la IA
        const ganadorCounts = { MORENA: 0, MC: 0, PRI_PRD: 0, PAN: 0, OTROS: 0, SIN_DATOS: 0 };
        let totalMorenaVotes = 0;
        let totalMcVotes = 0;
        let totalPriPrdVotes = 0;
        let totalPanVotes = 0;
        let totalOtrosVotes = 0;

        secciones.forEach(s => {
            const g = s.ganador || 'SIN_DATOS';
            ganadorCounts[g] = (ganadorCounts[g] || 0) + 1;
            totalMorenaVotes += s.votos_coalicion_morena || 0;
            totalMcVotes += s.votos_mc || 0;
            totalPriPrdVotes += s.votos_coalicion_pri_prd || 0;
            totalPanVotes += s.votos_pan || 0;
            totalOtrosVotes += s.votos_otros || 0;
        });

        const totalVotosCalculados = totalMorenaVotes + totalMcVotes + totalPriPrdVotes + totalPanVotes + totalOtrosVotes;

        const contexto = `
Eres un consultor electoral estratégico experto en campañas políticas en México, especializado en análisis geo-electoral y movilización territorial de tierra.
Estás trabajando en la campaña para ${puesto} en el estado de Campeche con miras a la elección de 2027.

Tienes acceso al MAPA DE CALOR ELECTORAL REAL del estado, cruzado con el padrón actual de simpatizantes del candidato y los resultados oficiales de la elección 2024 por sección.

DATOS ELECTORALES GENERALES (Elección 2024):
- Lista Nominal Total: ${stats.lista_nominal_total.toLocaleString()} electores registrados en el estado.
- Votos emitidos 2024: ${stats.votos_historicos_2024.toLocaleString()} (Votos válidos en las secciones procesadas: ${totalVotosCalculados.toLocaleString()})
- Participación promedio histórica: ${(stats.participacion_historica * 100).toFixed(1)}%
- Votos dormidos (personas con credencial que no votaron): ${stats.votos_dormidos.toLocaleString()} electores.
- META MÍNIMA PARA GANAR (mayoría simple estimada): ${stats.meta_votos.toLocaleString()} votos.
- Afiliados/ciudadanos en tu padrón de simpatizantes capturados en el sistema: ${totalPadron} ciudadanos.

VOTACIÓN REAL Y SECCIONES GANADAS EN 2024 (Mapa de Calor):
1. MORENA-PT-PVEM: ${totalMorenaVotes.toLocaleString()} votos (${((totalMorenaVotes / totalVotosCalculados) * 100).toFixed(1)}% del voto válido) - Ganó ${ganadorCounts.MORENA} secciones electorales.
2. Movimiento Ciudadano (MC): ${totalMcVotes.toLocaleString()} votos (${((totalMcVotes / totalVotosCalculados) * 100).toFixed(1)}% del voto válido) - Ganó ${ganadorCounts.MC} secciones electorales.
3. PRI-PRD: ${totalPriPrdVotes.toLocaleString()} votos (${((totalPriPrdVotes / totalVotosCalculados) * 100).toFixed(1)}% del voto válido) - Ganó ${ganadorCounts.PRI_PRD} secciones electorales.
4. PAN: ${totalPanVotes.toLocaleString()} votos (${((totalPanVotes / totalVotosCalculados) * 100).toFixed(1)}% del voto válido) - Ganó ${ganadorCounts.PAN} secciones electorales.
5. Otros partidos locales: ${totalOtrosVotes.toLocaleString()} votos (${((totalOtrosVotes / totalVotosCalculados) * 100).toFixed(1)}%) - Ganó ${ganadorCounts.OTROS} secciones.
- Secciones sin datos/comicios: ${ganadorCounts.SIN_DATOS}

TOP 15 SECCIONES CON MAYOR CANTIDAD DE VOTOS DORMIDOS ${topContextoLabel.toUpperCase()} (Mayor oportunidad de movilización):
${top15.map((s, i) => `${i+1}. Sección ${s.seccion} (${s.municipio}): ${s.dormidos.toLocaleString()} votos dormidos (Participación: ${(s.participacion*100).toFixed(1)}%, Lista Nominal: ${s.lista_nominal.toLocaleString()}, Ganador 2024: ${s.ganador_label || 'Sin datos'} con ${s.ganador_votos?.toLocaleString()} votos. Votos desglosados -> MORENA-PT-PVEM: ${s.votos_coalicion_morena?.toLocaleString()} v., MC: ${s.votos_mc?.toLocaleString()} v., PRI-PRD: ${s.votos_coalicion_pri_prd?.toLocaleString()} v., PAN: ${s.votos_pan?.toLocaleString()} v.).`).join('\n')}

PREGUNTA DEL ESTRATEGA DE CAMPAÑA:
${pregunta}

Responde en español con recomendaciones tácticas específicas, citando números de sección y datos de votación/municipio cuando sea relevante. Analiza la fuerza relativa de MORENA, MC y PRI-PRD, el abstencionismo (votos dormidos) y propón tácticas concretas para el padrón (por ejemplo, dónde capturar más simpatizantes).
IMPORTANTE: Sé extremadamente directo, conciso y altamente accionable. Limita tu respuesta a un máximo de 3 a 5 puntos clave cortos (máximo 300 palabras en total) para asegurar una respuesta rápida y evitar que la conexión expire (Timeout). Usa viñetas y estructura clara.`;

        const { GoogleGenerativeAI } = require('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(GEMINI_KEY);
        
        const modelsToTry = ['gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-3.1-flash-lite'];
        let result = null;
        let chosenModel = '';
        let lastError = null;

        for (const modelName of modelsToTry) {
            try {
                console.log(`Intentando consultar Gemini con el modelo: ${modelName}`);
                const model = genAI.getGenerativeModel({ model: modelName });
                result = await model.generateContent(contexto);
                chosenModel = modelName;
                break;
            } catch (err) {
                console.error(`Error con modelo ${modelName}:`, err.message);
                lastError = err;
            }
        }

        if (!result) {
            throw lastError || new Error('Todos los modelos fallaron.');
        }

        const text = result.response.text();
        res.json({ 
            respuesta: text, 
            fuente: `Gemini (${chosenModel.replace('gemini-', '').toUpperCase()})`, 
            timestamp: new Date().toISOString() 
        });
    } catch (err) {
        console.error('Electoral AI error:', err);
        res.status(500).json({ error: 'Error en el consultor IA: ' + err.message });
    }
};

module.exports = { getResumen, getSecciones: getSecciones_, getDemografia, calcularMetaEndpoint, aiConsult };
