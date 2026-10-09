/**
 * controllers/peopleController.js
 * Padrón de simpatizantes.
 *
 * Cambios frente a la versión anterior:
 *   · se pagina y filtra en la base, nunca se devuelve el padrón completo;
 *   · la clave de elector viaja enmascarada salvo para nivel 2 o superior;
 *   · las fotos se guardan en disco y solo se manda la URL;
 *   · cada consulta se acota al territorio del usuario.
 */

const prisma = require('../services/db');
const { audit } = require('../services/auditService');
const { packIne, hashIne, decrypt } = require('../services/crypto');
const { saveImage, deleteForOwner } = require('../services/storage');
const { findSeccion } = require('../services/territoryService');
const { personScope, withScope, canTouchPerson } = require('../services/scope');

const MAX_LIMIT = 200;

/**
 * Prepara una persona para salir por la API.
 * La clave de elector solo se descifra si el rol lo permite.
 */
const serialize = (p, { canSeeSensitive = false } = {}) => {
  const { ineEnc, ineHash, ...rest } = p;
  return {
    ...rest,
    // Compatibilidad con la interfaz: sigue existiendo el campo `ine`.
    ine: canSeeSensitive && ineEnc
      ? decrypt(ineEnc)
      : (p.ineLast4 ? `••••••••••••${p.ineLast4}` : null),
    ineMasked: !canSeeSensitive,
    tieneIne: Boolean(ineHash),
    // La foto de la credencial se oculta a quien no puede verla.
    inePhotoUrl: canSeeSensitive ? p.inePhotoUrl : null
  };
};

// ───────────────────────────────────────────────────────────────────────────
// GET /api/people — listado paginado
// ───────────────────────────────────────────────────────────────────────────
const getPeople = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const skip = (page - 1) * limit;

    const {
      search, seccion, municipio, localidad, createdBy,
      desde, hasta, sinTerritorio, orderBy = 'createdAt', order = 'desc',
      // Fase 2: segmentación por estructura y compromiso
      afinidad, promotorId, compromiso, verificado, origen,
      esLider, requiereTransporte, sinPromotor, conMarcas
    } = req.query;

    const filters = [];

    if (search) {
      const term = String(search).trim();
      const or = [
        { name: { contains: term, mode: 'insensitive' } },
        { phone: { contains: term } },
        { address: { contains: term, mode: 'insensitive' } },
        { localidad: { contains: term, mode: 'insensitive' } }
      ];
      // Buscar por clave de elector: se compara contra el hash, sin descifrar.
      const h = hashIne(term);
      if (h) or.push({ ineHash: h });
      filters.push({ OR: or });
    }

    if (seccion) filters.push({ seccion: String(seccion) });
    if (municipio) filters.push({ municipio: String(municipio) });
    if (localidad) filters.push({ localidad: String(localidad) });
    if (createdBy) filters.push({ createdBy: String(createdBy) });
    if (sinTerritorio === 'true') filters.push({ territoryId: null });

    if (afinidad) filters.push({ afinidad: String(afinidad) });
    if (origen) filters.push({ origen: String(origen) });
    if (promotorId) filters.push({ promotorId: String(promotorId) });
    if (sinPromotor === 'true') filters.push({ promotorId: null });
    if (compromiso !== undefined && compromiso !== '') {
      filters.push({ compromisoVoto: compromiso === 'true' });
    }
    if (verificado !== undefined && verificado !== '') {
      filters.push({ verificado: verificado === 'true' });
    }
    if (esLider === 'true') filters.push({ esLider: true });
    if (requiereTransporte === 'true') filters.push({ requiereTransporte: true });
    // Solo los registros con alguna marca de calidad sin resolver.
    if (conMarcas === 'true') {
      filters.push({ qualityFlags: { some: { estado: 'PENDIENTE' } } });
    }

    if (desde || hasta) {
      const createdAt = {};
      if (desde) createdAt.gte = new Date(desde);
      if (hasta) createdAt.lte = new Date(`${hasta}T23:59:59.999Z`);
      filters.push({ createdAt });
    }

    const scope = await personScope(req.user);
    const where = withScope(scope, filters.length ? { AND: filters } : {});

    const validOrder = ['createdAt', 'name', 'seccion', 'municipio', 'updatedAt', 'afinidad', 'multiplicador'];
    const sortField = validOrder.includes(orderBy) ? orderBy : 'createdAt';
    const sortDir = order === 'asc' ? 'asc' : 'desc';

    const [total, data] = await Promise.all([
      prisma.person.count({ where }),
      prisma.person.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortField]: sortDir },
        include: {
          territory: { select: { id: true, name: true, code: true, type: true } },
          promotor: { select: { id: true, nombre: true, rol: true } },
          _count: { select: { qualityFlags: true } },
          consents: {
            where: { revocadoAt: null },
            select: { id: true, otorgado: true, otorgadoAt: true, medio: true },
            take: 1,
            orderBy: { otorgadoAt: 'desc' }
          }
        }
      })
    ]);

    res.json({
      data: data.map(p => ({
        ...serialize(p, req.user),
        consentimiento: p.consents[0] || null,
        consents: undefined
      })),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit) || 1
    });
  } catch (error) {
    console.error('Error al obtener padrón:', error);
    res.status(500).json({ error: 'Error al obtener padrón' });
  }
};

// ───────────────────────────────────────────────────────────────────────────
// GET /api/people/stats — totales sin traerse las filas
// ───────────────────────────────────────────────────────────────────────────
const getPeopleStats = async (req, res) => {
  try {
    const scope = await personScope(req.user);

    const [
      total, conIne, conTelefono, conUbicacion, sinSeccion, porMunicipio, ultimos7,
      porAfinidad, compromisos, verificados, sinPromotor, multiplicador, marcados
    ] = await Promise.all([
        prisma.person.count({ where: scope }),
        prisma.person.count({ where: withScope(scope, { ineHash: { not: null } }) }),
        prisma.person.count({ where: withScope(scope, { phone: { not: null } }) }),
        prisma.person.count({ where: withScope(scope, { lat: { not: null } }) }),
        prisma.person.count({ where: withScope(scope, { territoryId: null }) }),
        prisma.person.groupBy({
          by: ['municipio'],
          where: scope,
          _count: { _all: true },
          orderBy: { _count: { municipio: 'desc' } },
          take: 15
        }),
        prisma.person.count({
          where: withScope(scope, {
            createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
          })
        }),
        prisma.person.groupBy({
          by: ['afinidad'], where: scope, _count: { _all: true }
        }),
        prisma.person.count({ where: withScope(scope, { compromisoVoto: true }) }),
        prisma.person.count({ where: withScope(scope, { verificado: true }) }),
        prisma.person.count({ where: withScope(scope, { promotorId: null }) }),
        prisma.person.aggregate({ where: scope, _sum: { multiplicador: true } }),
        prisma.person.count({
          where: withScope(scope, { qualityFlags: { some: { estado: 'PENDIENTE' } } })
        })
      ]);

    res.json({
      total,
      conIne,
      conTelefono,
      conUbicacion,
      sinSeccion,
      ultimos7dias: ultimos7,
      porMunicipio: porMunicipio.map(m => ({
        municipio: m.municipio || 'Sin municipio',
        total: m._count._all
      })),

      // ── Estructura y compromiso (Fase 2) ──
      porAfinidad: porAfinidad
        .map(a => ({ afinidad: a.afinidad, total: a._count._all }))
        .sort((x, y) => y.total - x.total),
      compromisos,
      verificados,
      sinPromotor,
      // Cada simpatizante más los que se comprometió a llevar.
      alcancePotencial: total + (multiplicador._sum.multiplicador || 0),
      marcadosCalidad: marcados,
      tasaCompromiso: total > 0 ? compromisos / total : 0,
      tasaVerificacion: total > 0 ? verificados / total : 0
    });
  } catch (error) {
    console.error('Error en estadísticas del padrón:', error);
    res.status(500).json({ error: 'Error al calcular estadísticas' });
  }
};

// ───────────────────────────────────────────────────────────────────────────
// GET /api/people/map — solo coordenadas, para pintar el mapa sin cargar todo
// ───────────────────────────────────────────────────────────────────────────
const getPeopleMap = async (req, res) => {
  try {
    const scope = await personScope(req.user);
    const limit = Math.min(5000, parseInt(req.query.limit, 10) || 2000);

    const points = await prisma.person.findMany({
      where: withScope(scope, { lat: { not: null }, lng: { not: null } }),
      select: { id: true, name: true, lat: true, lng: true, seccion: true, municipio: true },
      take: limit
    });

    res.json(points);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener puntos del mapa' });
  }
};

// ───────────────────────────────────────────────────────────────────────────
// GET /api/people/:id
// ───────────────────────────────────────────────────────────────────────────
const getPersonById = async (req, res) => {
  try {
    const person = await prisma.person.findUnique({
      where: { id: req.params.id },
      include: {
        territory: { select: { id: true, name: true, code: true, type: true } },
        consents: { orderBy: { otorgadoAt: 'desc' } }
      }
    });
    if (!person) return res.status(404).json({ error: 'Persona no encontrada' });

    if (!(await canTouchPerson(req.user, person))) {
      return res.status(403).json({ error: 'Esta persona está fuera de tu alcance' });
    }

    // Consultar la credencial completa queda registrado en la bitácora.
    if (req.user.canSeeSensitive && person.ineEnc) {
      audit(req, 'VIEW_SENSITIVE', 'Person', person.id, `consulta de credencial: ${person.name}`);
    }

    res.json(serialize(person, req.user));
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener la persona' });
  }
};

// ───────────────────────────────────────────────────────────────────────────
// POST /api/people
// ───────────────────────────────────────────────────────────────────────────
const createPerson = async (req, res) => {
  try {
    const {
      id, _id, createdBy, ine, photo, inePhoto, photoUrl, inePhotoUrl,
      territoryId, consentimiento, ...data
    } = req.body;

    if (!data.name || !String(data.name).trim()) {
      return res.status(400).json({ error: 'El nombre es obligatorio' });
    }

    const inePack = packIne(ine);
    if (inePack.ineHash) {
      const clash = await prisma.person.findUnique({
        where: { ineHash: inePack.ineHash },
        select: { id: true, name: true }
      });
      if (clash) {
        return res.status(400).json({
          error: `Esa clave de elector ya está registrada a nombre de ${clash.name}`
        });
      }
    }

    const territory = territoryId
      ? { id: territoryId }
      : await findSeccion(data.seccion);

    const campaign = req.user.campaignId
      ? { id: req.user.campaignId }
      : await prisma.campaign.findFirst({ where: { isDefault: true } });

    const person = await prisma.person.create({
      data: {
        ...data,
        ...inePack,
        territoryId: territory?.id ?? null,
        campaignId: campaign?.id ?? null,
        createdBy: req.user?.username || null
      }
    });

    // Las imágenes llegan en base64 desde la app de campo y van a disco.
    const savedPhoto = photo
      ? await saveImage({
          data: photo, kind: 'PERSON_PHOTO', ownerType: 'Person',
          ownerId: person.id, uploadedBy: req.user?.username
        })
      : null;
    const savedIne = inePhoto
      ? await saveImage({
          data: inePhoto, kind: 'PERSON_INE', ownerType: 'Person',
          ownerId: person.id, uploadedBy: req.user?.username, sensitive: true
        })
      : null;

    let final = person;
    if (savedPhoto || savedIne) {
      final = await prisma.person.update({
        where: { id: person.id },
        data: {
          photoUrl: savedPhoto?.url ?? null,
          inePhotoUrl: savedIne?.url ?? null
        }
      });
    }

    // Consentimiento de tratamiento de datos personales.
    if (consentimiento) {
      await prisma.consent.create({
        data: {
          personId: person.id,
          otorgado: Boolean(consentimiento.otorgado),
          medio: consentimiento.medio || 'FISICO',
          avisoVersion: consentimiento.avisoVersion || '1.0',
          finalidades: consentimiento.finalidades || 'CONTACTO,GESTION',
          ip: req.ip4 || null,
          capturedBy: req.user?.username || null
        }
      });
    }

    audit(req, 'CREATE', 'Person', person.id, person.name);
    res.status(201).json(serialize(final, req.user));
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'La clave INE ya está registrada' });
    }
    console.error('Error al registrar persona:', error);
    res.status(500).json({ error: 'Error al registrar persona' });
  }
};

// ───────────────────────────────────────────────────────────────────────────
// PUT /api/people/:id
// ───────────────────────────────────────────────────────────────────────────
const updatePerson = async (req, res) => {
  try {
    const existing = await prisma.person.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Persona no encontrada' });

    if (!(await canTouchPerson(req.user, existing))) {
      return res.status(403).json({ error: 'Esta persona está fuera de tu alcance' });
    }

    const {
      id, _id, createdAt, updatedAt, createdBy, ine, photo, inePhoto,
      photoUrl, inePhotoUrl, territory, consents, consentimiento,
      ineMasked, tieneIne, ...data
    } = req.body;

    // La clave solo se toca si llega una nueva y sin enmascarar.
    if (ine !== undefined && ine !== null && !String(ine).includes('•')) {
      const pack = packIne(ine);
      if (pack.ineHash) {
        const clash = await prisma.person.findFirst({
          where: { ineHash: pack.ineHash, id: { not: req.params.id } },
          select: { name: true }
        });
        if (clash) {
          return res.status(400).json({
            error: `Esa clave de elector ya está registrada a nombre de ${clash.name}`
          });
        }
      }
      Object.assign(data, pack);
    }

    // Si cambió la sección, se recalcula el territorio.
    if (data.seccion !== undefined && data.seccion !== existing.seccion) {
      const t = await findSeccion(data.seccion);
      data.territoryId = t?.id ?? null;
    }

    if (photo) {
      const saved = await saveImage({
        data: photo, kind: 'PERSON_PHOTO', ownerType: 'Person',
        ownerId: req.params.id, uploadedBy: req.user?.username
      });
      if (saved) data.photoUrl = saved.url;
    }
    if (inePhoto) {
      const saved = await saveImage({
        data: inePhoto, kind: 'PERSON_INE', ownerType: 'Person',
        ownerId: req.params.id, uploadedBy: req.user?.username, sensitive: true
      });
      if (saved) data.inePhotoUrl = saved.url;
    }

    const updated = await prisma.person.update({
      where: { id: req.params.id },
      data
    });

    if (consentimiento) {
      await prisma.consent.create({
        data: {
          personId: updated.id,
          otorgado: Boolean(consentimiento.otorgado),
          medio: consentimiento.medio || 'FISICO',
          avisoVersion: consentimiento.avisoVersion || '1.0',
          finalidades: consentimiento.finalidades || 'CONTACTO,GESTION',
          ip: req.ip4 || null,
          capturedBy: req.user?.username || null
        }
      });
    }

    audit(req, 'UPDATE', 'Person', updated.id, updated.name);
    res.json(serialize(updated, req.user));
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'La clave INE ya está registrada en otra persona' });
    }
    console.error('Error al actualizar persona:', error);
    res.status(500).json({ error: 'Error al actualizar persona' });
  }
};

// ───────────────────────────────────────────────────────────────────────────
// DELETE /api/people/:id
// ───────────────────────────────────────────────────────────────────────────
const deletePerson = async (req, res) => {
  try {
    const existing = await prisma.person.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Persona no encontrada' });

    if (!(await canTouchPerson(req.user, existing))) {
      return res.status(403).json({ error: 'Esta persona está fuera de tu alcance' });
    }

    await deleteForOwner('Person', req.params.id);
    await prisma.person.delete({ where: { id: req.params.id } });

    audit(req, 'DELETE', 'Person', req.params.id, existing.name);
    res.json({ message: 'Persona eliminada' });
  } catch (error) {
    console.error('Error al eliminar persona:', error);
    res.status(500).json({ error: 'Error al eliminar persona' });
  }
};

// ───────────────────────────────────────────────────────────────────────────
// POST /api/people/bulk — sincronización desde la app offline
// ───────────────────────────────────────────────────────────────────────────
const bulkUpsert = async (req, res) => {
  try {
    const items = Array.isArray(req.body?.people) ? req.body.people : [];
    if (!items.length) return res.status(400).json({ error: 'No se recibieron registros' });
    if (items.length > 500) {
      return res.status(400).json({ error: 'Máximo 500 registros por envío' });
    }

    const campaign = req.user.campaignId
      ? { id: req.user.campaignId }
      : await prisma.campaign.findFirst({ where: { isDefault: true } });

    const creados = [];
    const rechazados = [];

    for (const item of items) {
      try {
        const { id, _id, localId, ine, photo, inePhoto, createdBy, ...data } = item;
        if (!data.name) { rechazados.push({ localId, error: 'Sin nombre' }); continue; }

        const pack = packIne(ine);
        if (pack.ineHash) {
          const clash = await prisma.person.findUnique({
            where: { ineHash: pack.ineHash }, select: { id: true }
          });
          if (clash) {
            rechazados.push({ localId, error: 'Clave de elector duplicada', existingId: clash.id });
            continue;
          }
        }

        const territory = await findSeccion(data.seccion);
        const person = await prisma.person.create({
          data: {
            ...data,
            ...pack,
            territoryId: territory?.id ?? null,
            campaignId: campaign?.id ?? null,
            createdBy: req.user?.username || null
          }
        });

        if (photo) {
          const s = await saveImage({
            data: photo, kind: 'PERSON_PHOTO', ownerType: 'Person',
            ownerId: person.id, uploadedBy: req.user?.username
          });
          if (s) await prisma.person.update({ where: { id: person.id }, data: { photoUrl: s.url } });
        }
        if (inePhoto) {
          const s = await saveImage({
            data: inePhoto, kind: 'PERSON_INE', ownerType: 'Person',
            ownerId: person.id, uploadedBy: req.user?.username, sensitive: true
          });
          if (s) await prisma.person.update({ where: { id: person.id }, data: { inePhotoUrl: s.url } });
        }

        creados.push({ localId, id: person.id });
      } catch (err) {
        rechazados.push({ localId: item.localId, error: err.message });
      }
    }

    audit(req, 'CREATE', 'Person', null, `sincronización masiva: ${creados.length} altas`);
    res.json({ creados, rechazados, total: items.length });
  } catch (error) {
    console.error('Error en sincronización masiva:', error);
    res.status(500).json({ error: 'Error al sincronizar registros' });
  }
};

module.exports = {
  getPeople, getPeopleStats, getPeopleMap, getPersonById,
  createPerson, updatePerson, deletePerson, bulkUpsert
};
