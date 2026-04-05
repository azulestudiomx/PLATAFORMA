/**
 * hooks/useAuth.ts
 * Auth hook - manages login state, JWT token, and user session persistence.
 */
import { useState, useEffect, useCallback } from 'react';
import { authApi, saveToken, getToken, clearToken } from '../services/api';
import { User, UserRole } from '../types';

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

  // Rehydrate user from localStorage on mount
  useEffect(() => {
    const savedUser = localStorage.getItem('user_session');
    const token = getToken();
    if (savedUser && token) {
      setState({ user: JSON.parse(savedUser), isLoading: false, error: null });
    } else {
      setState(s => ({ ...s, isLoading: false }));
    }

    // Listen for automatic logout events (e.g., 401 from API)
    const handleLogout = () => logout();
    window.addEventListener('auth:logout', handleLogout);
    return () => window.removeEventListener('auth:logout', handleLogout);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    setState(s => ({ ...s, isLoading: true, error: null }));
    try {
      const data = await authApi.login(username, password);
      // Save JWT token and user data
      saveToken(data.token);
      localStorage.setItem('user_session', JSON.stringify(data.user));
      setState({ user: data.user, isLoading: false, error: null });
      return data.user;
    } catch (err: any) {
      setState(s => ({ ...s, isLoading: false, error: err.message }));
      throw err;
    }
  }, []);

  const logout = useCallback(() => {
    clearToken();
    localStorage.removeItem('user_session');
    setState({ user: null, isLoading: false, error: null });
  }, []);

  return {
    user: state.user,
    isLoading: state.isLoading,
    error: state.error,
    isAuthenticated: !!state.user,
    isAdmin: state.user?.role === UserRole.ADMIN,
    login,
    logout,
  };
};
