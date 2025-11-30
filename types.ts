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
  synced: number; // 0 = false, 1 = true
  status: 'Pendiente' | 'En Proceso' | 'Resuelto';
  user?: string;
  customData?: Record<string, any>; // For dynamic fields
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  location: string;
  type: 'Reunión' | 'Visita' | 'Mitin';
}

export interface User {
  username: string;
  role: UserRole;
  name: string;
}