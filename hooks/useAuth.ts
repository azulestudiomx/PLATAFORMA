/**
 * hooks/useAuth.ts
 * Sesión del usuario: login, permisos por nivel y cierre de sesión.
 *
 * La sesión guardada se revalida contra el servidor al montar: como los
 * tokens ahora se pueden revocar, un `localStorage` con datos no basta para
 * dar por buena la sesión.
 */
import { useState, useEffect, useCallback } from 'react';
import { authApi, saveToken, getToken, clearToken } from '../services/api';
import { User, levelOf, hasLevel } from '../types';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  error: string | null;
}

export const useAuth = () => {
  const [state, setState] = useState<AuthState>({
    user: null,
    isLoading: true,
    error: null,
  });

  const logout = useCallback(async () => {
    // Avisar al servidor permite revocar la sesión; si falla, se cierra igual.
    try { if (getToken()) await authApi.logout(); } catch { /* sin conexión */ }
    clearToken();
    localStorage.removeItem('user_session');
    setState({ user: null, isLoading: false, error: null });
  }, []);

  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      const savedUser = localStorage.getItem('user_session');
      const token = getToken();

      if (!savedUser || !token) {
        if (!cancelled) setState(s => ({ ...s, isLoading: false }));
        return;
      }

      // Mostrar de inmediato lo guardado para no parpadear…
      if (!cancelled) {
        setState({ user: JSON.parse(savedUser), isLoading: true, error: null });
      }

      // …y confirmar contra el servidor que la sesión sigue viva.
      try {
        const fresh = await authApi.me();
        if (cancelled) return;
        localStorage.setItem('user_session', JSON.stringify(fresh));
        setState({ user: fresh, isLoading: false, error: null });
      } catch {
        // Sesión revocada o caducada: el interceptor ya limpió el token.
        if (!cancelled) {
          clearToken();
          localStorage.removeItem('user_session');
          setState({ user: null, isLoading: false, error: null });
        }
      }
    };

    restore();

    const handleLogout = () => {
      clearToken();
      localStorage.removeItem('user_session');
      setState({ user: null, isLoading: false, error: null });
    };
    window.addEventListener('auth:logout', handleLogout);

    return () => {
      cancelled = true;
      window.removeEventListener('auth:logout', handleLogout);
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    setState(s => ({ ...s, isLoading: true, error: null }));
    try {
      const data = await authApi.login(username, password);
      saveToken(data.token);
      localStorage.setItem('user_session', JSON.stringify(data.user));
      setState({ user: data.user, isLoading: false, error: null });
      return data.user;
    } catch (err: any) {
      setState(s => ({ ...s, isLoading: false, error: err.message }));
      throw err;
    }
  }, []);

  const role = state.user?.role;
  const level = levelOf(role);

  return {
    user: state.user,
    isLoading: state.isLoading,
    error: state.error,
    isAuthenticated: Boolean(state.user),

    level,
    /** Autoridad suficiente para el nivel pedido (menor número = más alto). */
    can: (maxLevel: number) => hasLevel(role, maxLevel),

    /** Atajos usados por las vistas. */
    isAdmin: hasLevel(role, 2),          // dirección de campaña
    isCoordinador: hasLevel(role, 4),    // coordinación territorial
    canManageUsers: hasLevel(role, 3),
    canSeeSensitive: state.user?.canSeeSensitive ?? hasLevel(role, 2),
    canExport: state.user?.canExport ?? hasLevel(role, 3),

    login,
    logout,
  };
};
