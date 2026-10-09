/**
 * services/api.ts
 * Capa única de acceso al backend: inyecta el token y normaliza errores.
 */

import type { Paginated, Person, Territory, RoleDefinition, Session } from '../types';

const BASE_URL = (import.meta as any).env?.VITE_API_URL || '';

// ───────────────────────────────────────────────────────────────────────────
// Token
// ───────────────────────────────────────────────────────────────────────────
export const getToken = (): string | null => localStorage.getItem('auth_token');
export const saveToken = (token: string) => localStorage.setItem('auth_token', token);
export const clearToken = () => localStorage.removeItem('auth_token');

/** Convierte un objeto de filtros en query string, omitiendo lo vacío. */
const qs = (params: Record<string, any> = {}): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const str = search.toString();
  return str ? `?${str}` : '';
};

// ───────────────────────────────────────────────────────────────────────────
// Fetch base
// ───────────────────────────────────────────────────────────────────────────
const apiFetch = async (path: string, options: RequestInit = {}): Promise<any> => {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const response = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  // 401 fuera del login: la sesión caducó o fue revocada desde el panel.
  if (response.status === 401 && !path.includes('/auth/login')) {
    clearToken();
    window.dispatchEvent(new Event('auth:logout'));
    throw new Error('Tu sesión terminó. Inicia sesión de nuevo.');
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: `Error ${response.status}` }));
    throw new Error(errorData.error || `La petición falló (${response.status})`);
  }

  if (response.status === 204) return null;
  return response.json();
};

// ───────────────────────────────────────────────────────────────────────────
// Autenticación y usuarios
// ───────────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (username: string, password: string) =>
    apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),

  logout: () => apiFetch('/api/auth/logout', { method: 'POST' }),

  me: () => apiFetch('/api/auth/me'),

  roles: (): Promise<{ all: RoleDefinition[]; assignable: RoleDefinition[] }> =>
    apiFetch('/api/auth/roles'),

  listUsers: () => apiFetch('/api/auth/users'),

  register: (data: {
    username: string; password: string; name: string; role: string;
    territoryId?: string | null; phone?: string; email?: string;
  }) => apiFetch('/api/auth/register', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: string, data: any) =>
    apiFetch(`/api/auth/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  delete: (id: string) => apiFetch(`/api/auth/users/${id}`, { method: 'DELETE' }),

  sessions: (userId?: string): Promise<Session[]> =>
    apiFetch(`/api/auth/sessions${qs({ userId })}`),

  revokeSession: (id: string) =>
    apiFetch(`/api/auth/sessions/${id}`, { method: 'DELETE' }),
};

// ───────────────────────────────────────────────────────────────────────────
// Expedientes
// ───────────────────────────────────────────────────────────────────────────
export interface ReportFilters {
  page?: number; limit?: number; status?: string; needType?: string;
  municipio?: string; assignedTo?: string; urgency?: string;
  search?: string; desde?: string; hasta?: string;
}

export const reportsApi = {
  list: (pageOrFilters: number | ReportFilters = 1, limit = 20) => {
    // Acepta list(1, 50) — la forma antigua — y list({ status, page… }).
    const filters: ReportFilters = typeof pageOrFilters === 'number'
      ? { page: pageOrFilters, limit }
      : pageOrFilters;
    return apiFetch(`/api/reports${qs(filters as any)}`);
  },

  stats: () => apiFetch('/api/reports/stats'),

  map: (limit = 2000) => apiFetch(`/api/reports/map${qs({ limit })}`),

  getById: (id: string) => apiFetch(`/api/reports/${id}`),

  create: (report: object) =>
    apiFetch('/api/reports', { method: 'POST', body: JSON.stringify(report) }),

  update: (id: string, data: object) =>
    apiFetch(`/api/reports/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  delete: (id: string) => apiFetch(`/api/reports/${id}`, { method: 'DELETE' }),

  history: (id: string) => apiFetch(`/api/reports/${id}/history`),
};

// ───────────────────────────────────────────────────────────────────────────
// Padrón
// ───────────────────────────────────────────────────────────────────────────
export interface PeopleFilters {
  page?: number; limit?: number; search?: string;
  seccion?: string; municipio?: string; localidad?: string;
  createdBy?: string; desde?: string; hasta?: string;
  sinTerritorio?: boolean; orderBy?: string; order?: 'asc' | 'desc';
  // Segmentación por estructura y compromiso
  afinidad?: string; promotorId?: string; origen?: string;
  compromiso?: boolean; verificado?: boolean;
  esLider?: boolean; requiereTransporte?: boolean;
  sinPromotor?: boolean; conMarcas?: boolean;
}

export interface PeopleStats {
  total: number;
  conIne: number;
  conTelefono: number;
  conUbicacion: number;
  sinSeccion: number;
  ultimos7dias: number;
  porMunicipio: { municipio: string; total: number }[];
  // Estructura y compromiso
  porAfinidad: { afinidad: string; total: number }[];
  compromisos: number;
  verificados: number;
  sinPromotor: number;
  alcancePotencial: number;
  marcadosCalidad: number;
  tasaCompromiso: number;
  tasaVerificacion: number;
}

export const peopleApi = {
  list: (filters: PeopleFilters = {}): Promise<Paginated<Person>> =>
    apiFetch(`/api/people${qs(filters as any)}`),

  stats: (): Promise<PeopleStats> => apiFetch('/api/people/stats'),

  map: (limit = 2000) => apiFetch(`/api/people/map${qs({ limit })}`),

  getById: (id: string): Promise<Person> => apiFetch(`/api/people/${id}`),

  create: (person: object) =>
    apiFetch('/api/people', { method: 'POST', body: JSON.stringify(person) }),

  update: (id: string, data: object) =>
    apiFetch(`/api/people/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  delete: (id: string) => apiFetch(`/api/people/${id}`, { method: 'DELETE' }),

  /** Sincronización de la app offline: hasta 500 registros por envío. */
  bulk: (people: object[]) =>
    apiFetch('/api/people/bulk', { method: 'POST', body: JSON.stringify({ people }) }),
};

// ───────────────────────────────────────────────────────────────────────────
// Territorio
// ───────────────────────────────────────────────────────────────────────────
export const territoriesApi = {
  tree: (maxDepth = 3): Promise<Territory[]> =>
    apiFetch(`/api/territories/tree${qs({ maxDepth })}`),

  list: (filters: { type?: string; parentId?: string; search?: string } = {}): Promise<Territory[]> =>
    apiFetch(`/api/territories${qs(filters)}`),

  avance: (id: string) => apiFetch(`/api/territories/${id}/avance`),

  seed: () => apiFetch('/api/territories/seed', { method: 'POST' }),
};

// ───────────────────────────────────────────────────────────────────────────
// Archivos
// ───────────────────────────────────────────────────────────────────────────
export const mediaApi = {
  /** URL directa para <img src>. El navegador manda la cookie, no el token,
   *  así que las imágenes sensibles se piden con fetch autenticado. */
  url: (id: string, size: 'full' | 'thumb' = 'full') =>
    `${BASE_URL}/api/media/${id}${size === 'thumb' ? '?size=thumb' : ''}`,

  upload: (data: {
    data: string; kind?: string; ownerType: string; ownerId: string; sensitive?: boolean;
  }) => apiFetch('/api/media', { method: 'POST', body: JSON.stringify(data) }),

  listForOwner: (ownerType: string, ownerId: string) =>
    apiFetch(`/api/media${qs({ ownerType, ownerId })}`),

  stats: () => apiFetch('/api/media/stats'),
};

/**
 * Descarga una imagen protegida y devuelve un blob URL utilizable en <img>.
 * Necesario porque <img src> no lleva la cabecera Authorization.
 */
export const fetchProtectedImage = async (path: string): Promise<string | null> => {
  const token = getToken();
  if (!path) return null;
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return null;
    return URL.createObjectURL(await res.blob());
  } catch {
    return null;
  }
};

// ───────────────────────────────────────────────────────────────────────────
// Estadísticas y bitácora
// ───────────────────────────────────────────────────────────────────────────
export const statsApi = {
  brigadas: () => apiFetch('/api/stats/brigadas'),

  audit: (params: {
    page?: number; limit?: number; entity?: string; username?: string; action?: string;
  } = {}) => apiFetch(`/api/stats/audit${qs(params)}`),
};

// ───────────────────────────────────────────────────────────────────────────
// Calendario
// ───────────────────────────────────────────────────────────────────────────
export const eventsApi = {
  list: () => apiFetch('/api/events'),
  create: (event: object) =>
    apiFetch('/api/events', { method: 'POST', body: JSON.stringify(event) }),
  update: (id: string, data: object) =>
    apiFetch(`/api/events/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => apiFetch(`/api/events/${id}`, { method: 'DELETE' }),
};

// ───────────────────────────────────────────────────────────────────────────
// Configuración
// ───────────────────────────────────────────────────────────────────────────
export const configApi = {
  get: () => apiFetch('/api/config'),
  update: (config: object) =>
    apiFetch('/api/config', { method: 'POST', body: JSON.stringify(config) }),
};

// ───────────────────────────────────────────────────────────────────────────
// Inteligencia electoral
// ───────────────────────────────────────────────────────────────────────────
export const electoralApi = {
  getResumen: () => apiFetch('/api/electoral/resumen'),

  getSecciones: (filters: { municipio?: string; semaforo?: string; distrito?: number } = {}) =>
    apiFetch(`/api/electoral/secciones${qs(filters)}`),

  getMunicipios: () => apiFetch('/api/electoral/municipios'),

  getDemografia: (seccion: string | number) =>
    apiFetch(`/api/electoral/demografia/${seccion}`),

  getCoberturaDemografica: () => apiFetch('/api/electoral/cobertura-demografica'),

  calcularMeta: (config: {
    participacion_estimada?: number; porcentaje_necesario?: number;
    municipios?: string[]; distritos?: number[];
  }) => apiFetch('/api/electoral/meta', { method: 'POST', body: JSON.stringify(config) }),

  aiConsult: (pregunta: string, puesto: string) =>
    apiFetch('/api/electoral/ai-consult', {
      method: 'POST', body: JSON.stringify({ pregunta, puesto }),
    }),
};

export const healthApi = {
  check: () => apiFetch('/api/health'),
};

// ───────────────────────────────────────────────────────────────────────────
// Red de promoción y metas (Fase 2)
// ───────────────────────────────────────────────────────────────────────────
export interface StructureNode {
  id: string;
  nombre: string;
  telefono?: string | null;
  email?: string | null;
  rol: string;
  nivel: number;
  parentId?: string | null;
  territoryId?: string | null;
  territory?: { id: string; name: string; code: string; type: string } | null;
  user?: { id: string; username: string; active?: boolean } | null;
  userId?: string | null;
  metaSimpatizantes: number;
  activo: boolean;
  depth: number;
  personasDirectas?: number;
  personasRama?: number;
  metaRama?: number;
  avance?: number | null;
  children?: StructureNode[];
  _count?: { personas: number; children: number };
}

export interface NodeAvance {
  nodeId: string;
  nombre: string;
  rol: string;
  territorio?: { id: string; name: string; type: string } | null;
  integrantesRama: number;
  personas: number;
  compromisos: number;
  verificados: number;
  alcancePotencial: number;
  meta: number;
  avance: number | null;
  faltan: number;
  tasaVerificacion: number | null;
  tasaCompromiso: number | null;
}

export interface Goal {
  id: string;
  tipo: string;
  target: number;
  nodeId?: string | null;
  territoryId?: string | null;
  node?: { id: string; nombre: string; rol: string } | null;
  territory?: { id: string; name: string; type: string; code: string } | null;
  desde?: string | null;
  hasta?: string | null;
  notas?: string | null;
  logrado: number;
  avance: number | null;
  faltan: number;
  semaforo: 'verde' | 'amarillo' | 'rojo' | 'sin-meta';
}

export const structureApi = {
  tree: (rootId?: string): Promise<StructureNode[]> =>
    apiFetch(`/api/structure/tree${qs({ rootId })}`),

  list: (filters: { rol?: string; territoryId?: string; search?: string; activo?: boolean } = {})
    : Promise<StructureNode[]> => apiFetch(`/api/structure${qs(filters as any)}`),

  avance: (id: string): Promise<NodeAvance> => apiFetch(`/api/structure/${id}/avance`),

  huecos: (tipo = 'SECCION', limit = 50) =>
    apiFetch(`/api/structure/huecos${qs({ tipo, limit })}`),

  create: (data: object) =>
    apiFetch('/api/structure', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: string, data: object) =>
    apiFetch(`/api/structure/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  delete: (id: string) => apiFetch(`/api/structure/${id}`, { method: 'DELETE' }),

  /** Asigna personas a un promotor: por lista de ids o por sección completa. */
  asignar: (id: string, data: { personIds?: string[]; seccion?: string }) =>
    apiFetch(`/api/structure/${id}/asignar`, { method: 'POST', body: JSON.stringify(data) }),

  goals: (): Promise<Goal[]> => apiFetch('/api/structure/goals'),

  createGoal: (data: object) =>
    apiFetch('/api/structure/goals', { method: 'POST', body: JSON.stringify(data) }),

  updateGoal: (id: string, data: object) =>
    apiFetch(`/api/structure/goals/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  deleteGoal: (id: string) =>
    apiFetch(`/api/structure/goals/${id}`, { method: 'DELETE' }),
};

// ───────────────────────────────────────────────────────────────────────────
// Control de calidad del padrón (Fase 2)
// ───────────────────────────────────────────────────────────────────────────
export interface QualityFlag {
  id: string;
  personId?: string | null;
  tipo: string;
  severidad: 'ALTA' | 'MEDIA' | 'BAJA';
  detalle?: string | null;
  relacionadoCon?: string | null;
  capturadoPor?: string | null;
  estado: 'PENDIENTE' | 'CONFIRMADO' | 'DESCARTADO' | 'CORREGIDO';
  resolucion?: string | null;
  resueltoPor?: string | null;
  resueltoAt?: string | null;
  createdAt: string;
  person?: {
    id: string; name: string; seccion?: string | null;
    municipio?: string | null; phone?: string | null;
    createdBy?: string | null; createdAt?: string;
  } | null;
}

export interface QualitySummary {
  totalMarcas: number;
  personasMarcadas: number;
  totalPadron: number;
  proporcionAfectada: number;
  porTipo: { tipo: string; total: number }[];
  porSeveridad: { severidad: string; total: number }[];
  porEstado: { estado: string; total: number }[];
}

export interface CapturistaConfianza {
  usuario: string;
  capturas: number;
  marcas: number;
  proporcionMarcada: number;
  confianza: number;
  nivel: 'NORMAL' | 'REVISAR' | 'CRÍTICO';
}

export const qualityApi = {
  resumen: (): Promise<QualitySummary> => apiFetch('/api/quality/resumen'),

  analizar: () => apiFetch('/api/quality/analizar', { method: 'POST' }),

  flags: (filters: {
    page?: number; limit?: number; tipo?: string;
    severidad?: string; estado?: string; capturadoPor?: string;
  } = {}): Promise<Paginated<QualityFlag>> => apiFetch(`/api/quality/flags${qs(filters)}`),

  resolve: (id: string, estado: string, resolucion?: string) =>
    apiFetch(`/api/quality/flags/${id}`, {
      method: 'PUT', body: JSON.stringify({ estado, resolucion }),
    }),

  bulkResolve: (ids: string[], estado: string, resolucion?: string) =>
    apiFetch('/api/quality/flags/bulk', {
      method: 'POST', body: JSON.stringify({ ids, estado, resolucion }),
    }),

  capturistas: (): Promise<CapturistaConfianza[]> => apiFetch('/api/quality/capturistas'),
};

// ───────────────────────────────────────────────────────────────────────────
// Brigadas, jornadas y visitas (Fase 3)
// ───────────────────────────────────────────────────────────────────────────
export interface Brigade {
  id: string;
  nombre: string;
  vehiculo?: string | null;
  activa: boolean;
  jefeId?: string | null;
  jefe?: { id: string; nombre: string } | null;
  territoryId?: string | null;
  territory?: { id: string; name: string; code: string; type: string } | null;
  integrantes: { id: string; nombre: string; rol: string; userId?: string | null }[];
  ultimaJornada?: { id: string; fecha: string; estado: string; dentroDeZona: boolean } | null;
  _count?: { jornadas: number; visitas: number };
}

export interface BrigadeShift {
  id: string;
  brigadeId: string;
  brigade?: { id: string; nombre: string };
  fecha: string;
  territory?: { id: string; name: string; code: string; type: string } | null;
  checkInAt?: string | null;
  checkInKm?: number | null;
  dentroDeZona: boolean;
  checkOutAt?: string | null;
  metaVisitas: number;
  estado: 'PLANEADA' | 'EN_CURSO' | 'CERRADA';
  notas?: string | null;
  resumen?: string | null;
  horasEnCampo?: number | null;
  cumplimientoMeta?: number | null;
  porResultado?: Record<string, number>;
  visitas?: Visit[];
  _count?: { visitas: number };
}

export interface Visit {
  id: string;
  resultado: string;
  direccion?: string | null;
  notas?: string | null;
  lat?: number | null;
  lng?: number | null;
  evidenciaUrl?: string | null;
  createdBy?: string | null;
  createdAt: string;
  person?: { id: string; name: string } | null;
  brigade?: { id: string; nombre: string } | null;
  territory?: { id: string; name: string; code: string } | null;
}

export const RESULTADOS_VISITA = [
  { valor: 'CONTACTADO', label: 'Contactado', color: '#15803D' },
  { valor: 'NO_ESTABA', label: 'No estaba', color: '#B45309' },
  { valor: 'RECHAZO', label: 'Rechazó', color: '#B91C1C' },
  { valor: 'YA_APOYA', label: 'Ya apoya', color: '#0F766E' },
  { valor: 'CERRADO', label: 'Cerrado', color: '#64748B' },
  { valor: 'DOMICILIO_INEXISTENTE', label: 'Domicilio inexistente', color: '#475569' },
];

export const brigadesApi = {
  list: (filters: { activa?: boolean; territoryId?: string } = {}): Promise<Brigade[]> =>
    apiFetch(`/api/brigades${qs(filters as any)}`),

  create: (data: object) =>
    apiFetch('/api/brigades', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: string, data: object) =>
    apiFetch(`/api/brigades/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  delete: (id: string) => apiFetch(`/api/brigades/${id}`, { method: 'DELETE' }),

  shifts: (filters: { brigadeId?: string; estado?: string; desde?: string; hasta?: string } = {})
    : Promise<BrigadeShift[]> => apiFetch(`/api/brigades/shifts${qs(filters)}`),

  getShift: (id: string): Promise<BrigadeShift> => apiFetch(`/api/brigades/shifts/${id}`),

  createShift: (data: object) =>
    apiFetch('/api/brigades/shifts', { method: 'POST', body: JSON.stringify(data) }),

  /** Registra la entrada y comprueba la geocerca del territorio asignado. */
  checkIn: (id: string, lat: number, lng: number) =>
    apiFetch(`/api/brigades/shifts/${id}/checkin`, {
      method: 'POST', body: JSON.stringify({ lat, lng }),
    }),

  checkOut: (id: string, data: { lat?: number; lng?: number; resumen?: string }) =>
    apiFetch(`/api/brigades/shifts/${id}/checkout`, {
      method: 'POST', body: JSON.stringify(data),
    }),

  visits: (filters: { shiftId?: string; brigadeId?: string; resultado?: string; seccion?: string; page?: number } = {})
    : Promise<Paginated<Visit>> => apiFetch(`/api/brigades/visits${qs(filters)}`),

  createVisit: (data: object) =>
    apiFetch('/api/brigades/visits', { method: 'POST', body: JSON.stringify(data) }),

  cobertura: () => apiFetch('/api/brigades/cobertura'),
};

// ───────────────────────────────────────────────────────────────────────────
// Encuestas (Fase 3)
// ───────────────────────────────────────────────────────────────────────────
export interface SurveyQuestion {
  id: string;
  orden: number;
  texto: string;
  tipo: 'UNICA' | 'MULTIPLE' | 'ESCALA' | 'ABIERTA' | 'NUMERO';
  opciones: string[];
  requerida: boolean;
}

export interface Survey {
  id: string;
  titulo: string;
  descripcion?: string | null;
  activa: boolean;
  anonima: boolean;
  preguntas: SurveyQuestion[];
  _count?: { respuestas: number };
  createdAt: string;
}

export interface SurveyResults {
  survey: { id: string; titulo: string; activa: boolean };
  totalRespuestas: number;
  porPregunta: {
    questionId: string; texto: string; tipo: string; respondidas: number;
    conteo?: { opcion: string; total: number; porcentaje: number }[];
    promedio?: number | null; minimo?: number | null; maximo?: number | null;
    textos?: string[];
  }[];
  porSeccion: { seccion: string; total: number }[];
}

export const surveysApi = {
  list: (activa?: boolean): Promise<Survey[]> => apiFetch(`/api/surveys${qs({ activa })}`),
  get: (id: string): Promise<Survey> => apiFetch(`/api/surveys/${id}`),
  create: (data: object) =>
    apiFetch('/api/surveys', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: object) =>
    apiFetch(`/api/surveys/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id: string) => apiFetch(`/api/surveys/${id}`, { method: 'DELETE' }),
  responder: (id: string, data: object) =>
    apiFetch(`/api/surveys/${id}/responder`, { method: 'POST', body: JSON.stringify(data) }),
  resultados: (id: string, seccion?: string): Promise<SurveyResults> =>
    apiFetch(`/api/surveys/${id}/resultados${qs({ seccion })}`),
};

// ───────────────────────────────────────────────────────────────────────────
// Mensajería masiva (Fase 3)
// ───────────────────────────────────────────────────────────────────────────
export interface MessageCampaign {
  id: string;
  nombre: string;
  canal: 'WHATSAPP' | 'SMS' | 'EMAIL';
  plantilla: string;
  segmento: Record<string, any>;
  estado: 'BORRADOR' | 'LISTA' | 'ENVIANDO' | 'ENVIADA' | 'CANCELADA';
  simulado: boolean;
  totalDestinatarios: number;
  enviados: number;
  fallidos: number;
  enviadaAt?: string | null;
  createdAt: string;
  _count?: { mensajes: number };
}

export interface VistaPrevia {
  destinatarios: number;
  descartados: number;
  motivosDescarte: Record<string, number>;
  muestra: { nombre: string; destino: string; cuerpo: string | null }[];
}

export const messagingApi = {
  /** Qué canales tienen credenciales reales configuradas en el servidor. */
  proveedores: (): Promise<Record<string, { configurado: boolean; requiere: string[] }>> =>
    apiFetch('/api/messaging/proveedores'),

  list: (): Promise<MessageCampaign[]> => apiFetch('/api/messaging'),

  create: (data: object) =>
    apiFetch('/api/messaging', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: string, data: object) =>
    apiFetch(`/api/messaging/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  delete: (id: string) => apiFetch(`/api/messaging/${id}`, { method: 'DELETE' }),

  /** Cuántos recibirían y cómo se vería, sin tocar nada. */
  vistaPrevia: (data: { canal?: string; plantilla?: string; segmento?: object }): Promise<VistaPrevia> =>
    apiFetch('/api/messaging/vista-previa', { method: 'POST', body: JSON.stringify(data) }),

  /** Calcula la lista definitiva de destinatarios. No envía. */
  preparar: (id: string) => apiFetch(`/api/messaging/${id}/preparar`, { method: 'POST' }),

  /** Disparo final. Exige confirmación explícita. */
  enviar: (id: string) =>
    apiFetch(`/api/messaging/${id}/enviar`, {
      method: 'POST', body: JSON.stringify({ confirmar: true }),
    }),

  mensajes: (id: string, filters: { estado?: string; page?: number } = {}) =>
    apiFetch(`/api/messaging/${id}/mensajes${qs(filters)}`),
};

// ───────────────────────────────────────────────────────────────────────────
// Agenda del candidato (Fase 3)
// ───────────────────────────────────────────────────────────────────────────
export const agendaApi = {
  ficha: (eventId: string) => apiFetch(`/api/events/${eventId}/ficha`),

  addAsistente: (eventId: string, data: { nombre?: string; telefono?: string; personId?: string }) =>
    apiFetch(`/api/events/${eventId}/asistentes`, { method: 'POST', body: JSON.stringify(data) }),

  deleteAsistente: (eventId: string, attendeeId: string) =>
    apiFetch(`/api/events/${eventId}/asistentes/${attendeeId}`, { method: 'DELETE' }),
};
