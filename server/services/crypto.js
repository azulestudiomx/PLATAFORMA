/**
 * services/crypto.js
 * Cifrado de datos personales sensibles en reposo.
 *
 * La clave de elector se guarda cifrada con AES-256-GCM. Para poder seguir
 * buscando y garantizando unicidad sin descifrar toda la tabla, se guarda
 * además un HMAC-SHA256 determinista del valor normalizado.
 */

const crypto = require('crypto');

const ALGO = 'aes-256-gcm';

const getKey = () => {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      'ENCRYPTION_KEY debe ser de 32 bytes en hexadecimal (64 caracteres). ' +
      'Genera una con: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  return Buffer.from(hex, 'hex');
};

const getSalt = () => {
  const salt = process.env.INE_HASH_SALT;
  if (!salt) throw new Error('INE_HASH_SALT no está definido.');
  return salt;
};

/** Cifra un texto. Devuelve "iv:tag:datos" en base64, o null si viene vacío. */
const encrypt = (plain) => {
  if (plain === null || plain === undefined || plain === '') return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
};

/** Descifra un valor producido por encrypt(). Devuelve null si no se puede. */
const decrypt = (payload) => {
  if (!payload || typeof payload !== 'string') return null;
  const parts = payload.split(':');
  if (parts.length !== 3) return null;
  try {
    const [ivB64, tagB64, dataB64] = parts;
    const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const dec = Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final()
    ]);
    return dec.toString('utf8');
  } catch (err) {
    console.error('No se pudo descifrar un valor:', err.message);
    return null;
  }
};

/** Normaliza una clave de elector: mayúsculas, sin espacios ni guiones. */
const normalizeIne = (ine) => {
  if (!ine) return null;
  const clean = String(ine).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return clean.length ? clean : null;
};

/** HMAC determinista para índice único y búsqueda exacta. */
const hashIne = (ine) => {
  const norm = normalizeIne(ine);
  if (!norm) return null;
  return crypto.createHmac('sha256', getSalt()).update(norm).digest('hex');
};

/** Últimos 4 caracteres, para mostrar sin descifrar. */
const last4 = (ine) => {
  const norm = normalizeIne(ine);
  return norm ? norm.slice(-4) : null;
};

/** Huella de un buffer, para detectar archivos reutilizados entre registros. */
const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');

/**
 * Empaqueta una clave de elector para guardar en la base.
 * Devuelve los tres campos que espera el modelo Person.
 */
const packIne = (ine) => {
  const norm = normalizeIne(ine);
  if (!norm) return { ineEnc: null, ineHash: null, ineLast4: null };
  return { ineEnc: encrypt(norm), ineHash: hashIne(norm), ineLast4: last4(norm) };
};

module.exports = {
  encrypt, decrypt, normalizeIne, hashIne, last4, sha256, packIne
};
