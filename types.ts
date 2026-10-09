// ───────────────────────────────────────────────────────────────────────────
// Tipos compartidos de la plataforma
// ───────────────────────────────────────────────────────────────────────────

/**
 * Roles de la campaña. El nivel numérico decide qué territorio alcanza a ver
 * un usuario y sobre quién manda: menor número = mayor autoridad.
 */
export enum UserRole {
  SUPERADMIN = 'SUPERADMIN',
  CANDIDATO = 'CANDIDATO',
  COORD_GENERAL = 'COORD_GENERAL',
  COORD_MUNICIPAL = 'COORD_MUNICIPAL',
  COORD_SECCIONAL = 'COORD_SECCIONAL',
  PROMOTOR = 'PROMOTOR',
  CAPTURISTA = 'CAPTURISTA',
  REPRESENTANTE = 'REPRESENTANTE',

  // Nombres antiguos: siguen apareciendo en sesiones guardadas y en datos
  // heredados. El backend los traduce al entrar.
  ADMIN = 'ADMIN',
  CAPTURIST = 'CAPTURIST',
}

export const ROLE_LEVEL: Record<string, number> = {
  SUPERADMIN: 0,
  CANDIDATO: 1,
  COORD_GENERAL: 2,
  COORD_MUNICIPAL: 3,
  COORD_SECCIONAL: 4,
  PROMOTOR: 5,
  CAPTURISTA: 6,
  REPRESENTANTE: 7,
  // Alias heredados
  ADMIN: 0,
  CAPTURIST: 6,
};

export const ROLE_LABEL: Record<string, string> = {
  SUPERADMIN: 'Administrador del sistema',
  CANDIDATO: 'Candidato',
  COORD_GENERAL: 'Coordinador general',
  COORD_MUNICIPAL: 'Coordinador municipal',
  COORD_SECCIONAL: 'Coordinador seccional',
  PROMOTOR: 'Promotor',
  CAPTURISTA: 'Capturista',
  REPRESENTANTE: 'Representante de casilla',
  ADMIN: 'Administrador del sistema',
  CAPTURIST: 'Capturista',
};

/** Nivel de un rol; desconocido cae al más bajo. */
export const levelOf = (role?: string | null): number =>
  role && ROLE_LEVEL[role] !== undefined ? ROLE_LEVEL[role] : 6;

/** ¿El rol alcanza el nivel mínimo pedido? */
export const hasLevel = (role: string | undefined | null, maxLevel: number): boolean =>
  levelOf(role) <= maxLevel;

export enum NeedType {
  AGUA_POTABLE = 'Agua Potable',
  LUZ_ELECTRICA = 'Luz Eléctrica',
  DRENAJE = 'Drenaje',
  SALUD = 'Salud',
  EDUCACION = 'Educación',
  SEGURIDAD = 'Seguridad',
  OTRO = 'Otro',
}

export interface LocationData {
  lat: number;
  lng: number;
}

export interface Territory {
  id: string;
  type: 'ESTADO' | 'DISTRITO_F' | 'DISTRITO_L' | 'MUNICIPIO' | 'SECCION' | 'MANZANA';
  code: string;
  name: string;
  parentId?: string | null;
  listaNominal?: number | null;
  casillas?: number | null;
  tipoSeccion?: string | null;
  distritoF?: number | null;
  distritoL?: number | null;
  lat?: number | null;
  lng?: number | null;
  depth?: number;
  children?: Territory[];
}

export interface Consent {
  id?: string;
  otorgado: boolean;
  medio?: 'FISICO' | 'DIGITAL' | 'VERBAL';
  avisoVersion?: string;
  finalidades?: string;
  otorgadoAt?: string;
  revocadoAt?: string | null;
}

export interface Person {
  id?: string;
  _id?: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  municipio?: string;
  localidad?: string;
  distrito?: string;
  zona?: string;
  seccion?: string;

  /**
   * Clave de elector. Llega enmascarada (••••1234) salvo que el rol tenga
   * permiso para verla completa; `ineMasked` indica cuál de los dos es.
   */
  ine?: string | null;
  ineMasked?: boolean;
  ineLast4?: string | null;
  tieneIne?: boolean;

  birthday?: string;
  genero?: string;

  /** Las fotos viven en disco: aquí solo viaja la URL. */
  photoUrl?: string | null;
  inePhotoUrl?: string | null;
  /** Solo al capturar: base64 que el backend convierte a archivo. */
  photo?: string | null;
  inePhoto?: string | null;

  lat?: number | null;
  lng?: number | null;

  territoryId?: string | null;
  territory?: Pick<Territory, 'id' | 'name' | 'code' | 'type'> | null;
  campaignId?: string | null;

  consentimiento?: Consent | null;

  synced?: number;
  createdBy?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Report {
  id?: number | string;
  _id?: string;
  folio?: string | null;
  municipio: string;
  comunidad: string;
  location: LocationData;
  needType: string;
  description: string;
  evidenceBase64?: string | null;
  timestamp: number;
  synced?: boolean | number;
  status: string;
  user?: string;
  customData?: Record<string, any>;
  response?: string;
  resolvedAt?: string | Date;
  dueAt?: string | Date | null;
  hasEvidence?: boolean;
  evidenceUrl?: string;
  sentiment?: string;
  urgency?: string;
  evidenceGallery?: string[];
  assignedTo?: string | null;
  createdAt?: string;
}

export interface ReportHistoryEntry {
  id: string;
  reportId: string;
  username: string | null;
  action: string;
  fromStatus?: string | null;
  toStatus?: string | null;
  note?: string | null;
  createdAt: string;
}

export interface CalendarEvent {
  id: string;
  _id?: string;
  title: string;
  date: string;
  location: string;
  community?: string;
  type: string;
  description?: string;
  assignedTo?: string;
}

export interface User {
  id?: string;
  username: string;
  role: UserRole | string;
  level?: number;
  name: string;
  phone?: string | null;
  email?: string | null;
  active?: boolean;
  campaignId?: string | null;
  territoryId?: string | null;
  territory?: Pick<Territory, 'id' | 'name' | 'type'> | null;
  lastLoginAt?: string | null;
  createdAt?: string;
  canSeeSensitive?: boolean;
  canExport?: boolean;
}

export interface RoleDefinition {
  name: string;
  level: number;
  label: string;
  scope: string;
  description: string;
}

export interface Session {
  id: string;
  userAgent?: string | null;
  ip?: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt?: string | null;
  actual: boolean;
  activa: boolean;
}

/** Respuesta estándar de los listados paginados. */
export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}
