/**
 * services/storage.js
 * Las imágenes salen de la base de datos y viven en disco.
 *
 * Cada archivo se guarda una sola vez por contenido (se deduplica por huella
 * sha256) y siempre genera una miniatura, que es lo que consumen los listados.
 * La base solo guarda la ruta relativa, nunca los bytes.
 */

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const prisma = require('./db');
const { sha256 } = require('./crypto');

const UPLOAD_DIR = path.resolve(
  __dirname,
  '..',
  process.env.UPLOAD_DIR || './uploads'
);

const MAX_DIM = 1600;   // lado mayor de la imagen guardada
const THUMB_DIM = 320;  // lado mayor de la miniatura
const QUALITY = 82;

/** Crea la carpeta destino si no existe. */
const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

ensureDir(UPLOAD_DIR);

/** Convierte un data URI o base64 suelto en Buffer. Devuelve null si no es válido. */
const bufferFromBase64 = (input) => {
  if (!input || typeof input !== 'string') return null;
  const comma = input.indexOf(',');
  const raw = input.startsWith('data:') && comma !== -1 ? input.slice(comma + 1) : input;
  if (raw.length < 32) return null;
  try {
    const buf = Buffer.from(raw, 'base64');
    return buf.length > 0 ? buf : null;
  } catch {
    return null;
  }
};

/** Reparte los archivos en subcarpetas por huella para no saturar un directorio. */
const shardFor = (hash) => path.join(hash.slice(0, 2), hash.slice(2, 4));

/**
 * Guarda una imagen en disco y registra el MediaAsset.
 *
 * @param {object} opts
 * @param {string|Buffer} opts.data   base64, data URI o Buffer
 * @param {string} opts.kind          PERSON_PHOTO | PERSON_INE | REPORT_EVIDENCE | ACTA | INCIDENT
 * @param {string} opts.ownerType     Person | Report | Incident
 * @param {string} opts.ownerId
 * @param {string} [opts.uploadedBy]
 * @param {boolean} [opts.sensitive]  true para la credencial de elector
 * @returns {Promise<{url:string, thumbUrl:string, asset:object}|null>}
 */
const saveImage = async ({ data, kind, ownerType, ownerId, uploadedBy, sensitive = false }) => {
  const buf = Buffer.isBuffer(data) ? data : bufferFromBase64(data);
  if (!buf) return null;

  const hash = sha256(buf);
  const shard = shardFor(hash);
  const dir = path.join(UPLOAD_DIR, shard);
  ensureDir(dir);

  const filename = `${hash}.webp`;
  const thumbname = `${hash}_t.webp`;
  const relPath = path.join(shard, filename);
  const relThumb = path.join(shard, thumbname);
  const absPath = path.join(UPLOAD_DIR, relPath);
  const absThumb = path.join(UPLOAD_DIR, relThumb);

  let width = null;
  let height = null;

  // Si ya existe en disco con esa huella, no se vuelve a procesar.
  if (!fs.existsSync(absPath)) {
    const img = sharp(buf, { failOn: 'none' }).rotate();
    const meta = await img.metadata();
    width = meta.width || null;
    height = meta.height || null;

    await img
      .resize({ width: MAX_DIM, height: MAX_DIM, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: QUALITY })
      .toFile(absPath);

    await sharp(buf, { failOn: 'none' })
      .rotate()
      .resize({ width: THUMB_DIM, height: THUMB_DIM, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 70 })
      .toFile(absThumb);
  } else {
    try {
      const meta = await sharp(absPath).metadata();
      width = meta.width || null;
      height = meta.height || null;
    } catch { /* la miniatura ya existe, seguimos */ }
  }

  const bytes = fs.statSync(absPath).size;

  const asset = await prisma.mediaAsset.create({
    data: {
      kind,
      path: relPath,
      thumbPath: relThumb,
      mime: 'image/webp',
      bytes,
      sha256: hash,
      width,
      height,
      ownerType,
      ownerId: String(ownerId),
      sensitive,
      uploadedBy: uploadedBy || null
    }
  });

  return {
    url: `/api/media/${asset.id}`,
    thumbUrl: `/api/media/${asset.id}?size=thumb`,
    asset
  };
};

/** Ruta absoluta de un asset, para servirlo. */
const absolutePath = (asset, size = 'full') => {
  const rel = size === 'thumb' && asset.thumbPath ? asset.thumbPath : asset.path;
  return path.join(UPLOAD_DIR, rel);
};

/** Borra los archivos de un asset y su registro. */
const deleteAsset = async (assetId) => {
  const asset = await prisma.mediaAsset.findUnique({ where: { id: assetId } });
  if (!asset) return false;

  // Solo se borra del disco si ningún otro registro comparte la misma huella.
  const others = await prisma.mediaAsset.count({
    where: { sha256: asset.sha256, id: { not: asset.id } }
  });
  if (others === 0) {
    for (const rel of [asset.path, asset.thumbPath]) {
      if (!rel) continue;
      const abs = path.join(UPLOAD_DIR, rel);
      if (fs.existsSync(abs)) fs.unlinkSync(abs);
    }
  }
  await prisma.mediaAsset.delete({ where: { id: assetId } });
  return true;
};

/** Borra todos los assets de un dueño (al eliminar la persona o el reporte). */
const deleteForOwner = async (ownerType, ownerId) => {
  const assets = await prisma.mediaAsset.findMany({
    where: { ownerType, ownerId: String(ownerId) }
  });
  for (const a of assets) await deleteAsset(a.id);
  return assets.length;
};

module.exports = {
  UPLOAD_DIR, saveImage, absolutePath, deleteAsset, deleteForOwner, bufferFromBase64
};
