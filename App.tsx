import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import CaptureForm from './pages/CaptureForm';
import CalendarPage from './pages/CalendarPage';
import ReportsList from './pages/ReportsList';
import Login from './pages/Login';
import UserManagement from './pages/UserManagement';
import SettingsPage from './pages/SettingsPage';
import PeoplePage from './pages/PeoplePage';
import { ConfigProvider } from './contexts/ConfigContext';
import { UserRole } from './types';
import { useAuth } from './hooks/useAuth';

// ---------------------------------------------------------------------------
// React Query global client
// ---------------------------------------------------------------------------
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,       // data stays fresh 30s
      retry: 2,                // retry failed requests twice
      refetchOnWindowFocus: true,
    },
  },
});

// ---------------------------------------------------------------------------
// Protected route wrapper
// ---------------------------------------------------------------------------
const ProtectedRoute: React.FC<{ authenticated: boolean; children: React.ReactNode }> = ({ authenticated, children }) => {
  if (!authenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

// ---------------------------------------------------------------------------
// Inner app — needs useAuth which must live inside QueryClientProvider
// ---------------------------------------------------------------------------
const AppInner: React.FC = () => {
  const { user, isAuthenticated, isAdmin, login, logout } = useAuth();

  // Adapt User type for Layout/Login legacy props
  const legacyUser = user ? { ...user } : null;

  return (
    <ConfigProvider>
      <Router>
        <Layout user={legacyUser} onLogout={logout}>
          <Routes>
            {/* Public */}
            <Route
              path="/login"
              element={!isAuthenticated ? <Login onLogin={login} /> : <Navigate to="/" replace />}
            />

            {/* Protected */}
            <Route path="/" element={
              <ProtectedRoute authenticated={isAuthenticated}>
                {isAdmin ? <Dashboard /> : <Navigate to="/capture" replace />}
              </ProtectedRoute>
            } />

            <Route path="/capture" element={
              <ProtectedRoute authenticated={isAuthenticated}><CaptureForm /></ProtectedRoute>
            } />

            <Route path="/reports" element={
              <ProtectedRoute authenticated={isAuthenticated}><ReportsList /></ProtectedRoute>
            } />

            <Route path="/calendar" element={
              <ProtectedRoute authenticated={isAuthenticated}><CalendarPage /></ProtectedRoute>
            } />

            <Route path="/users" element={
              <ProtectedRoute authenticated={isAuthenticated}>
                {isAdmin ? <UserManagement /> : <Navigate to="/" replace />}
              </ProtectedRoute>
            } />

            <Route path="/configuracion" element={
              <ProtectedRoute authenticated={isAuthenticated}>
                {isAdmin ? <SettingsPage /> : <Navigate to="/" replace />}
              </ProtectedRoute>
            } />

            <Route path="/people" element={
              <ProtectedRoute authenticated={isAuthenticated}>
                {(user?.role === UserRole.ADMIN || user?.role === UserRole.CAPTURIST)
                  ? <PeoplePage />
                  : <Navigate to="/" replace />}
              </ProtectedRoute>
            } />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </Router>
    </ConfigProvider>
  );
};

// ---------------------------------------------------------------------------
// Root App — wraps everything in QueryClientProvider
// ---------------------------------------------------------------------------
const App: React.FC = () => (
  <QueryClientProvider client={queryClient}>
    <AppInner />
  </QueryClientProvider>
);

export default App;