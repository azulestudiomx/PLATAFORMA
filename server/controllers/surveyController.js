/**
 * controllers/surveyController.js
 * Encuestas y sondeos aplicados en campo.
 *
 * Los resultados se agregan por sección y por municipio: una encuesta de
 * campaña sirve para decidir dónde reforzar, no solo para tener el promedio.
 */

const prisma = require('../services/db');
const { audit } = require('../services/auditService');
const { findSeccion } = require('../services/territoryService');

const TIPOS_VALIDOS = ['UNICA', 'MULTIPLE', 'ESCALA', 'ABIERTA', 'NUMERO'];

const parseOpciones = (str) => {
  try { return JSON.parse(str || '[]'); } catch { return []; }
};

const shapeSurvey = (s) => ({
  ...s,
  preguntas: (s.preguntas || []).map(q => ({ ...q, opciones: parseOpciones(q.opciones) })),
});

// ───────────────────────────────────────────────────────────────────────────
const listSurveys = async (req, res) => {
  try {
    const where = {};
    if (req.query.activa !== undefined) where.activa = req.query.activa === 'true';

    const surveys = await prisma.survey.findMany({
      where,
      include: {
        preguntas: { orderBy: { orden: 'asc' } },
        _count: { select: { respuestas: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(surveys.map(shapeSurvey));
  } catch (error) {
    console.error('Error al listar encuestas:', error);
    res.status(500).json({ error: 'Error al listar las encuestas' });
  }
};

const getSurvey = async (req, res) => {
  try {
    const survey = await prisma.survey.findUnique({
      where: { id: req.params.id },
      include: {
        preguntas: { orderBy: { orden: 'asc' } },
        _count: { select: { respuestas: true } },
      },
    });
    if (!survey) return res.status(404).json({ error: 'Encuesta no encontrada' });
    res.json(shapeSurvey(survey));
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener la encuesta' });
  }
};

const createSurvey = async (req, res) => {
  try {
    const { titulo, descripcion, anonima, preguntas } = req.body;
    if (!titulo?.trim()) return res.status(400).json({ error: 'El título es obligatorio' });
    if (!Array.isArray(preguntas) || !preguntas.length) {
      return res.status(400).json({ error: 'Agrega al menos una pregunta' });
    }

    for (const p of preguntas) {
      if (!p.texto?.trim()) {
        return res.status(400).json({ error: 'Todas las preguntas necesitan texto' });
      }
      if (p.tipo && !TIPOS_VALIDOS.includes(p.tipo)) {
        return res.status(400).json({ error: `Tipo de pregunta inválido: ${p.tipo}` });
      }
      // Sin opciones, una pregunta de opción única no se puede contestar.
      if (['UNICA', 'MULTIPLE'].includes(p.tipo || 'UNICA')) {
        const ops = Array.isArray(p.opciones) ? p.opciones.filter((o) => String(o).trim()) : [];
        if (ops.length < 2) {
          return res.status(400).json({
            error: `La pregunta "${p.texto}" necesita al menos dos opciones`,
          });
        }
      }
    }

    const campaign = req.user.campaignId
      ? { id: req.user.campaignId }
      : await prisma.campaign.findFirst({ where: { isDefault: true } });

    const survey = await prisma.survey.create({
      data: {
        titulo: titulo.trim(),
        descripcion: descripcion || null,
        anonima: Boolean(anonima),
        campaignId: campaign?.id || null,
        createdBy: req.user.username,
        preguntas: {
          create: preguntas.map((p, i) => ({
            orden: p.orden ?? i,
            texto: p.texto.trim(),
            tipo: p.tipo || 'UNICA',
            opciones: JSON.stringify(
              Array.isArray(p.opciones) ? p.opciones.filter((o) => String(o).trim()) : []
            ),
            requerida: Boolean(p.requerida),
          })),
        },
      },
      include: { preguntas: { orderBy: { orden: 'asc' } } },
    });

    audit(req, 'CREATE', 'Survey', survey.id, survey.titulo);
    res.status(201).json(shapeSurvey(survey));
  } catch (error) {
    console.error('Error al crear encuesta:', error);
    res.status(500).json({ error: 'Error al crear la encuesta' });
  }
};

const updateSurvey = async (req, res) => {
  try {
    const { titulo, descripcion, activa } = req.body;
    const data = {};
    if (titulo) data.titulo = titulo.trim();
    if (descripcion !== undefined) data.descripcion = descripcion || null;
    if (activa !== undefined) data.activa = Boolean(activa);

    const survey = await prisma.survey.update({
      where: { id: req.params.id },
      data,
      include: { preguntas: { orderBy: { orden: 'asc' } } },
    });

    audit(req, 'UPDATE', 'Survey', survey.id, survey.titulo);
    res.json(shapeSurvey(survey));
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar la encuesta' });
  }
};

const deleteSurvey = async (req, res) => {
  try {
    const s = await prisma.survey.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { respuestas: true } } },
    });
    if (!s) return res.status(404).json({ error: 'Encuesta no encontrada' });

    // Con respuestas levantadas, se cierra en vez de borrarse: esos datos
    // son el resultado del trabajo de campo.
    if (s._count.respuestas > 0) {
      await prisma.survey.update({ where: { id: s.id }, data: { activa: false } });
      return res.json({
        message: `La encuesta tiene ${s._count.respuestas} respuestas, así que se cerró en lugar de borrarse.`,
        cerrada: true,
      });
    }

    await prisma.survey.delete({ where: { id: s.id } });
    audit(req, 'DELETE', 'Survey', s.id, s.titulo);
    res.json({ message: 'Encuesta eliminada' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar la encuesta' });
  }
};

// ───────────────────────────────────────────────────────────────────────────
// POST /api/surveys/:id/responder
// ───────────────────────────────────────────────────────────────────────────
const responder = async (req, res) => {
  try {
    const { personId, seccion, lat, lng, respuestas } = req.body;

    const survey = await prisma.survey.findUnique({
      where: { id: req.params.id },
      include: { preguntas: true },
    });
    if (!survey) return res.status(404).json({ error: 'Encuesta no encontrada' });
    if (!survey.activa) return res.status(400).json({ error: 'Esta encuesta ya está cerrada' });

    if (!Array.isArray(respuestas)) {
      return res.status(400).json({ error: 'No se recibieron respuestas' });
    }

    // Las preguntas obligatorias tienen que venir contestadas.
    const contestadas = new Set(
      respuestas.filter(r => r.valor != null && String(r.valor).trim() !== '')
        .map(r => r.questionId)
    );
    const faltantes = survey.preguntas.filter(q => q.requerida && !contestadas.has(q.id));
    if (faltantes.length) {
      return res.status(400).json({
        error: `Faltan preguntas obligatorias: ${faltantes.map(q => q.texto).join('; ')}`,
      });
    }

    const territory = seccion ? await findSeccion(seccion) : null;

    const response = await prisma.surveyResponse.create({
      data: {
        surveyId: survey.id,
        // Una encuesta anónima no guarda a quién se le aplicó.
        personId: survey.anonima ? null : (personId || null),
        territoryId: territory?.id || null,
        seccion: seccion || null,
        lat: lat != null ? Number(lat) : null,
        lng: lng != null ? Number(lng) : null,
        createdBy: req.user.username,
        respuestas: {
          create: respuestas
            .filter(r => r.questionId)
            .map(r => ({
              questionId: r.questionId,
              valor: Array.isArray(r.valor) ? JSON.stringify(r.valor)
                : r.valor != null ? String(r.valor) : null,
              valorNum: r.valorNum != null ? Number(r.valorNum)
                : (!Number.isNaN(Number(r.valor)) && r.valor !== '' && r.valor != null
                    ? Number(r.valor) : null),
            })),
        },
      },
      include: { respuestas: true },
    });

    res.status(201).json(response);
  } catch (error) {
    console.error('Error al guardar respuesta:', error);
    res.status(500).json({ error: 'Error al guardar la respuesta' });
  }
};

// ───────────────────────────────────────────────────────────────────────────
// GET /api/surveys/:id/resultados
// ───────────────────────────────────────────────────────────────────────────
const resultados = async (req, res) => {
  try {
    const survey = await prisma.survey.findUnique({
      where: { id: req.params.id },
      include: { preguntas: { orderBy: { orden: 'asc' } } },
    });
    if (!survey) return res.status(404).json({ error: 'Encuesta no encontrada' });

    const filtroSeccion = req.query.seccion ? String(req.query.seccion) : null;

    const responses = await prisma.surveyResponse.findMany({
      where: {
        surveyId: survey.id,
        ...(filtroSeccion ? { seccion: filtroSeccion } : {}),
      },
      include: {
        respuestas: true,
        territory: { select: { id: true, name: true, code: true } },
      },
    });

    const totalRespuestas = responses.length;

    // Agregado por pregunta.
    const porPregunta = survey.preguntas.map(q => {
      const answers = responses
        .flatMap(r => r.respuestas)
        .filter(a => a.questionId === q.id && a.valor != null);

      const base = {
        questionId: q.id,
        texto: q.texto,
        tipo: q.tipo,
        respondidas: answers.length,
      };

      if (['UNICA', 'MULTIPLE'].includes(q.tipo)) {
        const conteo = {};
        for (const a of answers) {
          // Las de opción múltiple guardan un arreglo en JSON.
          let vals = [a.valor];
          if (q.tipo === 'MULTIPLE') {
            try {
              const p = JSON.parse(a.valor);
              if (Array.isArray(p)) vals = p;
            } catch { /* venía como texto simple */ }
          }
          for (const v of vals) conteo[v] = (conteo[v] || 0) + 1;
        }
        return {
          ...base,
          opciones: parseOpciones(q.opciones),
          conteo: Object.entries(conteo)
            .map(([opcion, total]) => ({
              opcion,
              total,
              porcentaje: answers.length > 0 ? total / answers.length : 0,
            }))
            .sort((a, b) => b.total - a.total),
        };
      }

      if (['ESCALA', 'NUMERO'].includes(q.tipo)) {
        const nums = answers.map(a => a.valorNum).filter(v => v != null && !Number.isNaN(v));
        const suma = nums.reduce((a, b) => a + b, 0);
        return {
          ...base,
          promedio: nums.length ? Number((suma / nums.length).toFixed(2)) : null,
          minimo: nums.length ? Math.min(...nums) : null,
          maximo: nums.length ? Math.max(...nums) : null,
        };
      }

      // Abiertas: se devuelven las últimas, no se agregan.
      return {
        ...base,
        textos: answers.slice(-50).map(a => a.valor),
      };
    });

    // Agregado por sección: es lo que dice dónde reforzar.
    const porSeccion = {};
    for (const r of responses) {
      const clave = r.seccion || r.territory?.code || 'Sin sección';
      porSeccion[clave] = (porSeccion[clave] || 0) + 1;
    }

    res.json({
      survey: { id: survey.id, titulo: survey.titulo, activa: survey.activa },
      totalRespuestas,
      porPregunta,
      porSeccion: Object.entries(porSeccion)
        .map(([seccion, total]) => ({ seccion, total }))
        .sort((a, b) => b.total - a.total),
    });
  } catch (error) {
    console.error('Error al calcular resultados:', error);
    res.status(500).json({ error: 'Error al calcular los resultados' });
  }
};

module.exports = {
  listSurveys, getSurvey, createSurvey, updateSurvey, deleteSurvey,
  responder, resultados,
};
