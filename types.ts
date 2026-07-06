export enum UserRole {
  ADMIN = 'ADMIN',
  CAPTURIST = 'CAPTURIST'
}

export enum NeedType {
  AGUA_POTABLE = 'Agua Potable',
  LUZ_ELECTRICA = 'Luz Eléctrica',
  DRENAJE = 'Drenaje',
  SALUD = 'Salud',
  EDUCACION = 'Educación',
  SEGURIDAD = 'Seguridad',
  OTRO = 'Otro'
}

export interface LocationData {
  lat: number;
  lng: number;
}

export interface Report {
  id?: number; // Dexie auto-increment
  _id?: string; // MongoDB ID
  municipio: string;
  comunidad: string;
  location: LocationData;
  needType: string;
  description: string;
  evidenceBase64: string | null;
  timestamp: number;
  synced?: boolean | number; // 0 = false, 1 = true
  status: string;
  user?: string;
  customData?: Record<string, any>; // For dynamic fields
  response?: string;
  resolvedAt?: string | Date;
  hasEvidence?: boolean;
  evidenceUrl?: string;
  sentiment?: string;
  urgency?: string;
  evidenceGallery?: string[];
  assignedTo?: string | null;
}

export interface ReportHistoryEntry {
  id: string;
  reportId: string;
  username: string | null;
  action: string; // STATUS_CHANGE | ASSIGNED | COMMENT
  fromStatus?: string | null;
  toStatus?: string | null;
  note?: string | null;
  createdAt: string;
}

export interface CalendarEvent {
  id: string;
  _id?: string; // MongoDB ID
  title: string;
  date: string;
  location: string;
  community?: string;
  type: string; // 'Reunión' | 'Visita' | 'Jornada' | 'Mitin'
  description?: string;
  assignedTo?: string;
}

export interface User {
  username: string;
  role: UserRole;
  name: string;
}