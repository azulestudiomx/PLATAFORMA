/**
 * services/api.ts
 * Centralized API service layer - all HTTP calls go through here.
 * Handles JWT token injection and auth token storage.
 */

const BASE_URL = (import.meta as any).env?.VITE_API_URL || '';

// ---------------------------------------------------------------------------
// Auth token management
// ---------------------------------------------------------------------------
export const getToken = (): string | null => localStorage.getItem('auth_token');
export const saveToken = (token: string) => localStorage.setItem('auth_token', token);
export const clearToken = () => localStorage.removeItem('auth_token');

// ---------------------------------------------------------------------------
// Core fetch wrapper with automatic JWT injection
// ---------------------------------------------------------------------------
const apiFetch = async (path: string, options: RequestInit = {}): Promise<any> => {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${path}`, { ...options, headers });

  if (response.status === 401) {
    clearToken();
    window.dispatchEvent(new Event('auth:logout'));
    throw new Error('Sesión expirada. Por favor, inicia sesión de nuevo.');
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: `Error ${response.status}` }));
    throw new Error(errorData.error || `Request failed: ${response.status}`);
  }

  return response.json();
};

// ---------------------------------------------------------------------------
// Auth API
// ---------------------------------------------------------------------------
export const authApi = {
  login: (username: string, password: string) =>
    apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),

  listUsers: () => apiFetch('/api/auth/users'),

  register: (data: { username: string; password: string; name: string; role: string }) =>
    apiFetch('/api/auth/register', { method: 'POST', body: JSON.stringify(data) }),

  update: (id: string, data: any) =>
    apiFetch(`/api/auth/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  delete: (id: string) =>
    apiFetch(`/api/auth/users/${id}`, { method: 'DELETE' }),
};

// ---------------------------------------------------------------------------
// Reports API
// ---------------------------------------------------------------------------
export const reportsApi = {
  list: (page = 1, limit = 20) =>
    apiFetch(`/api/reports?page=${page}&limit=${limit}`),

  getById: (id: string) => apiFetch(`/api/reports/${id}`),

  create: (report: object) =>
    apiFetch('/api/reports', { method: 'POST', body: JSON.stringify(report) }),

  update: (id: string, data: object) =>
    apiFetch(`/api/reports/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  delete: (id: string) =>
    apiFetch(`/api/reports/${id}`, { method: 'DELETE' }),
};

// ---------------------------------------------------------------------------
// People (Padron) API
// ---------------------------------------------------------------------------
export const peopleApi = {
  list: () => apiFetch('/api/people'),

  create: (person: object) =>
    apiFetch('/api/people', { method: 'POST', body: JSON.stringify(person) }),

  update: (id: string, data: object) =>
    apiFetch(`/api/people/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  delete: (id: string) =>
    apiFetch(`/api/people/${id}`, { method: 'DELETE' }),
};

// ---------------------------------------------------------------------------
// Events (Calendar) API
// ---------------------------------------------------------------------------
export const eventsApi = {
  list: () => apiFetch('/api/events'),

  create: (event: object) =>
    apiFetch('/api/events', { method: 'POST', body: JSON.stringify(event) }),

  update: (id: string, data: object) =>
    apiFetch(`/api/events/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  delete: (id: string) =>
    apiFetch(`/api/events/${id}`, { method: 'DELETE' }),
};

// ---------------------------------------------------------------------------
// Config API
// ---------------------------------------------------------------------------
export const configApi = {
  get: () => apiFetch('/api/config'),

  update: (config: object) =>
    apiFetch('/api/config', { method: 'POST', body: JSON.stringify(config) }),
};
