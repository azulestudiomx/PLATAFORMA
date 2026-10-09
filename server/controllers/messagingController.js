/**
 * controllers/messagingController.js
 * Campañas de mensajería masiva.
 */

const prisma = require('../services/db');
const { audit } = require('../services/auditService');
const msg = require('../services/messagingService');

const CANALES = ['WHATSAPP', 'SMS', 'EMAIL'];

const proveedores = async (req, res) => {
  res.json(msg.estadoProveedores());
};

const list = async (req, res) => {
  try {
    const campanas = await prisma.messageCampaign.findMany({
      where: req.user.campaignId ? { campaignId: req.user.campaignId } : {},
      include: { _count: { select: { mensajes: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(campanas.map(c => ({
      ...c,
      segmento: (() => { try { return JSON.parse(c.segmento || '{}'); } catch { return {}; } })(),
    })));
  } catch (error) {
    res.status(500).json({ error: 'Error al listar las campañas de mensajes' });
  }
};

const create = async (req, res) => {
  try {
    const { nombre, canal, plantilla, segmento } = req.body;
    if (!nombre?.trim()) return res.status(400).json({ error: 'Ponle nombre a la campaña' });
    if (!plantilla?.trim()) return res.status(400).json({ error: 'Escribe el mensaje' });
    if (canal && !CANALES.includes(canal)) {
      return res.status(400).json({ error: `Canal inválido. Usa: ${CANALES.join(', ')}` });
    }

    const campaign = req.user.campaignId
      ? { id: req.user.campaignId }
      : await prisma.campaign.findFirst({ where: { isDefault: true } });

    const campana = await prisma.messageCampaign.create({
      data: {
        nombre: nombre.trim(),
        canal: canal || 'WHATSAPP',
        plantilla: plantilla.trim(),
        segmento: JSON.stringify(segmento || {}),
        campaignId: campaign?.id || null,
        simulado: !msg.proveedorConfigurado(canal || 'WHATSAPP'),
        createdBy: req.user.username,
      },
    });

    audit(req, 'CREATE', 'MessageCampaign', campana.id, `${campana.nombre} (${campana.canal})`);
    res.status(201).json(campana);
  } catch (error) {
    console.error('Error al crear campaña de mensajes:', error);
    res.status(500).json({ error: 'Error al crear la campaña' });
  }
};

const update = async (req, res) => {
  try {
    const actual = await prisma.messageCampaign.findUnique({ where: { id: req.params.id } });
    if (!actual) return res.status(404).json({ error: 'Campaña no encontrada' });
    if (actual.estado === 'ENVIADA') {
      return res.status(400).json({ error: 'Una campaña enviada ya no se puede editar' });
    }

    const { nombre, canal, plantilla, segmento } = req.body;
    const data = {};
    if (nombre) data.nombre = nombre.trim();
    if (canal && CANALES.includes(canal)) data.canal = canal;
    if (plantilla) data.plantilla = plantilla.trim();
    if (segmento !== undefined) data.segmento = JSON.stringify(segmento || {});

    // Cambiar el contenido invalida la lista ya calculada.
    if (Object.keys(data).length) data.estado = 'BORRADOR';

    const campana = await prisma.messageCampaign.update({ where: { id: req.params.id }, data });
    res.json(campana);
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar la campaña' });
  }
};

const remove = async (req, res) => {
  try {
    const c = await prisma.messageCampaign.findUnique({ where: { id: req.params.id } });
    if (!c) return res.status(404).json({ error: 'Campaña no encontrada' });
    await prisma.messageCampaign.delete({ where: { id: c.id } });
    audit(req, 'DELETE', 'MessageCampaign', c.id, c.nombre);
    res.json({ message: 'Campaña eliminada' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar la campaña' });
  }
};

/**
 * POST /api/messaging/:id/preparar
 * Calcula la lista de destinatarios. No envía.
 */
const preparar = async (req, res) => {
  try {
    const resultado = await msg.prepararCampana(req.params.id);
    audit(req, 'UPDATE', 'MessageCampaign', req.params.id,
      `lista preparada: ${resultado.destinatarios} destinatarios`);
    res.json(resultado);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

/**
 * POST /api/messaging/:id/vista-previa
 * Cuántos recibirían y cómo se vería, sin tocar nada.
 */
const vistaPrevia = async (req, res) => {
  try {
    const { segmento, plantilla, canal } = req.body;
    const { validos, descartados } = await msg.destinatariosDe(
      segmento || {}, canal || 'WHATSAPP'
    );

    res.json({
      destinatarios: validos.length,
      descartados: descartados.length,
      motivosDescarte: descartados.reduce((acc, d) => {
        acc[d.motivo] = (acc[d.motivo] || 0) + 1;
        return acc;
      }, {}),
      muestra: validos.slice(0, 3).map(p => ({
        nombre: p.name,
        destino: p.destino,
        cuerpo: plantilla ? msg.renderPlantilla(plantilla, p) : null,
      })),
    });
  } catch (error) {
    console.error('Error en vista previa:', error);
    res.status(500).json({ error: 'Error al calcular la vista previa' });
  }
};

/**
 * POST /api/messaging/:id/enviar
 * Paso explícito y separado. Nunca se dispara solo.
 */
const enviar = async (req, res) => {
  try {
    // Confirmación explícita: enviar miles de mensajes no se deshace.
    if (req.body?.confirmar !== true) {
      return res.status(400).json({
        error: 'Falta confirmar el envío. Manda { "confirmar": true } para proceder.',
      });
    }

    const resultado = await msg.enviarCampana(req.params.id, { usuario: req.user.username });
    audit(req, 'UPDATE', 'MessageCampaign', req.params.id,
      resultado.simulado
        ? `envío simulado: ${resultado.omitidos} omitidos (sin proveedor)`
        : `enviados: ${resultado.enviados}`);
    res.json(resultado);
  } catch (error) {
    console.error('Error al enviar campaña:', error);
    res.status(400).json({ error: error.message });
  }
};

const mensajes = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, parseInt(req.query.limit, 10) || 50);
    const where = { messageCampaignId: req.params.id };
    if (req.query.estado) where.estado = String(req.query.estado);

    const [total, data] = await Promise.all([
      prisma.message.count({ where }),
      prisma.message.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'asc' },
        include: { person: { select: { id: true, name: true, seccion: true } } },
      }),
    ]);

    res.json({ data, total, page, limit, pages: Math.ceil(total / limit) || 1 });
  } catch (error) {
    res.status(500).json({ error: 'Error al listar los mensajes' });
  }
};

module.exports = {
  proveedores, list, create, update, remove,
  preparar, vistaPrevia, enviar, mensajes,
};
