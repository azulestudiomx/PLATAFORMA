/**
 * services/messagingService.js
 * Mensajería masiva segmentada.
 *
 * Diseño deliberado: enviar miles de mensajes es una acción externa que no se
 * puede deshacer. Por eso este servicio:
 *
 *   · opera en SIMULACIÓN mientras no haya credenciales de proveedor;
 *   · nunca envía como efecto secundario de crear o guardar una campaña:
 *     el envío es siempre un paso aparte y explícito;
 *   · respeta la baja voluntaria y los teléfonos no contactables antes de
 *     armar la lista, no después.
 */

const prisma = require('./db');
const { esPlaceholder } = require('./qualityService');

/** ¿Hay un proveedor real configurado para este canal? */
const proveedorConfigurado = (canal) => {
  if (canal === 'WHATSAPP') {
    return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);
  }
  if (canal === 'SMS') {
    return Boolean(process.env.SMS_API_KEY && process.env.SMS_SENDER);
  }
  if (canal === 'EMAIL') {
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER);
  }
  return false;
};

/** Estado de configuración, para que la interfaz lo diga sin adivinar. */
const estadoProveedores = () => ({
  WHATSAPP: {
    configurado: proveedorConfigurado('WHATSAPP'),
    requiere: ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_ID'],
  },
  SMS: {
    configurado: proveedorConfigurado('SMS'),
    requiere: ['SMS_API_KEY', 'SMS_SENDER'],
  },
  EMAIL: {
    configurado: proveedorConfigurado('EMAIL'),
    requiere: ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'],
  },
});

/**
 * Traduce el segmento guardado (filtros del padrón) a un filtro de Prisma.
 * Es el mismo vocabulario que usa el listado del padrón, para que lo que se
 * ve en pantalla sea exactamente lo que se envía.
 */
const filtroDeSegmento = (segmento = {}) => {
  const filtros = [];

  if (segmento.seccion) filtros.push({ seccion: String(segmento.seccion) });
  if (segmento.municipio) filtros.push({ municipio: String(segmento.municipio) });
  if (segmento.afinidad) filtros.push({ afinidad: String(segmento.afinidad) });
  if (segmento.origen) filtros.push({ origen: String(segmento.origen) });
  if (segmento.promotorId) filtros.push({ promotorId: String(segmento.promotorId) });
  if (segmento.compromiso !== undefined) {
    filtros.push({ compromisoVoto: Boolean(segmento.compromiso) });
  }
  if (segmento.verificado !== undefined) {
    filtros.push({ verificado: Boolean(segmento.verificado) });
  }
  if (segmento.esLider) filtros.push({ esLider: true });
  if (segmento.requiereTransporte) filtros.push({ requiereTransporte: true });
  if (segmento.primeraVotacion) filtros.push({ primeraVotacion: true });
  if (segmento.adultoMayor) filtros.push({ adultoMayor: true });

  // Cumpleaños del día o del mes: el uso más común de la mensajería.
  if (segmento.cumpleHoy) {
    const hoy = new Date();
    const dd = String(hoy.getDate()).padStart(2, '0');
    const mm = String(hoy.getMonth() + 1).padStart(2, '0');
    filtros.push({
      OR: [
        { birthday: { contains: `-${mm}-${dd}` } },
        { birthday: { contains: `${dd}/${mm}` } },
      ],
    });
  }

  return filtros.length ? { AND: filtros } : {};
};

/**
 * Personas que efectivamente pueden recibir el mensaje.
 * Se descartan aquí, no al enviar: así el conteo que ve el usuario antes de
 * disparar es el número real de destinatarios.
 */
const destinatariosDe = async (segmento, canal) => {
  const base = filtroDeSegmento(segmento);

  const campoContacto = canal === 'EMAIL' ? 'email' : 'phone';
  const where = {
    AND: [
      base,
      { [campoContacto]: { not: null } },
      { NOT: { [campoContacto]: '' } },
      // Quien revocó su consentimiento no recibe nada.
      { NOT: { consents: { some: { revocadoAt: { not: null } } } } },
    ],
  };

  const personas = await prisma.person.findMany({
    where,
    select: { id: true, name: true, phone: true, email: true, seccion: true, municipio: true },
  });

  // Un "teléfono" que dice PENDIENTE no es un destinatario.
  const validos = [];
  const descartados = [];
  for (const p of personas) {
    const destino = canal === 'EMAIL' ? p.email : p.phone;
    if (canal === 'EMAIL') {
      if (destino && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(destino)) validos.push({ ...p, destino });
      else descartados.push({ ...p, motivo: 'Correo inválido' });
    } else if (!esPlaceholder(destino)) {
      validos.push({ ...p, destino });
    } else {
      descartados.push({ ...p, motivo: 'Teléfono no contactable' });
    }
  }

  return { validos, descartados };
};

/** Sustituye las variables de la plantilla con los datos de la persona. */
const renderPlantilla = (plantilla, persona) => {
  const primerNombre = String(persona.name || '').trim().split(/\s+/)[0] || '';
  return String(plantilla)
    .replace(/\{\{\s*nombre\s*\}\}/gi, persona.name || '')
    .replace(/\{\{\s*primer_nombre\s*\}\}/gi, primerNombre)
    .replace(/\{\{\s*seccion\s*\}\}/gi, persona.seccion || '')
    .replace(/\{\{\s*municipio\s*\}\}/gi, persona.municipio || '');
};

/**
 * Prepara la campaña: calcula destinatarios y crea un mensaje por persona,
 * todos en estado PENDIENTE. No manda nada.
 */
const prepararCampana = async (campanaId) => {
  const campana = await prisma.messageCampaign.findUnique({ where: { id: campanaId } });
  if (!campana) throw new Error('La campaña de mensajes no existe');
  if (['ENVIANDO', 'ENVIADA'].includes(campana.estado)) {
    throw new Error('Esta campaña ya fue enviada');
  }

  let segmento = {};
  try { segmento = JSON.parse(campana.segmento || '{}'); } catch { /* segmento vacío */ }

  const { validos, descartados } = await destinatariosDe(segmento, campana.canal);

  // Se rehace la lista desde cero por si el segmento o el padrón cambiaron.
  await prisma.message.deleteMany({ where: { messageCampaignId: campana.id } });

  if (validos.length) {
    await prisma.message.createMany({
      data: validos.map(p => ({
        messageCampaignId: campana.id,
        personId: p.id,
        destino: p.destino,
        cuerpo: renderPlantilla(campana.plantilla, p),
        estado: 'PENDIENTE',
      })),
    });
  }

  const actualizada = await prisma.messageCampaign.update({
    where: { id: campana.id },
    data: {
      estado: 'LISTA',
      totalDestinatarios: validos.length,
      enviados: 0,
      fallidos: 0,
      simulado: !proveedorConfigurado(campana.canal),
    },
  });

  return {
    campana: actualizada,
    destinatarios: validos.length,
    descartados: descartados.length,
    motivosDescarte: descartados.reduce((acc, d) => {
      acc[d.motivo] = (acc[d.motivo] || 0) + 1;
      return acc;
    }, {}),
    // Muestra de lo que se va a mandar, para revisarlo antes de disparar.
    muestra: validos.slice(0, 3).map(p => ({
      nombre: p.name,
      destino: p.destino,
      cuerpo: renderPlantilla(campana.plantilla, p),
    })),
  };
};

/**
 * Envía la campaña.
 *
 * Sin proveedor configurado no sale ni un mensaje: se marcan como OMITIDO y
 * se reporta el modo simulación. Es intencional — es preferible que el
 * usuario vea "no se envió nada" a que crea que se envió y no fue así.
 */
const enviarCampana = async (campanaId, { usuario } = {}) => {
  const campana = await prisma.messageCampaign.findUnique({ where: { id: campanaId } });
  if (!campana) throw new Error('La campaña de mensajes no existe');
  if (campana.estado === 'ENVIADA') throw new Error('Esta campaña ya fue enviada');
  if (campana.estado === 'BORRADOR') {
    throw new Error('Prepara la campaña antes de enviarla');
  }

  const pendientes = await prisma.message.findMany({
    where: { messageCampaignId: campana.id, estado: 'PENDIENTE' },
  });

  if (!pendientes.length) {
    throw new Error('No hay destinatarios en esta campaña');
  }

  const hayProveedor = proveedorConfigurado(campana.canal);

  await prisma.messageCampaign.update({
    where: { id: campana.id },
    data: { estado: 'ENVIANDO', simulado: !hayProveedor },
  });

  if (!hayProveedor) {
    // Modo simulación: se deja constancia de qué se habría enviado.
    await prisma.message.updateMany({
      where: { messageCampaignId: campana.id, estado: 'PENDIENTE' },
      data: {
        estado: 'OMITIDO',
        error: `Sin proveedor de ${campana.canal} configurado: no se envió`,
      },
    });

    const final = await prisma.messageCampaign.update({
      where: { id: campana.id },
      data: {
        estado: 'LISTA',
        simulado: true,
        enviados: 0,
        fallidos: 0,
      },
    });

    return {
      simulado: true,
      enviados: 0,
      omitidos: pendientes.length,
      campana: final,
      mensaje:
        `No se envió ningún mensaje: falta configurar el proveedor de ${campana.canal}. ` +
        `La lista de ${pendientes.length} destinatarios quedó preparada y lista para ` +
        `cuando se configuren las credenciales.`,
      requiere: estadoProveedores()[campana.canal]?.requiere || [],
    };
  }

  // Con proveedor real: el envío concreto se implementa por canal.
  // Aquí se deja el punto de integración explícito en lugar de un envío
  // silencioso a medias.
  throw new Error(
    `El proveedor de ${campana.canal} está configurado, pero falta implementar ` +
    `la llamada concreta a su API en messagingService.enviarCampana(). ` +
    `No se envió nada para no dejar la campaña a medias.`
  );
};

module.exports = {
  proveedorConfigurado, estadoProveedores, filtroDeSegmento,
  destinatariosDe, renderPlantilla, prepararCampana, enviarCampana,
};
