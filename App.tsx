import React, { Suspense, lazy } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Layout from './components/Layout';
import Login from './pages/Login';
import { ConfigProvider } from './contexts/ConfigContext';
import { useAuth } from './hooks/useAuth';

// Code splitting: cada página se descarga solo cuando se visita.
// Crítico para capturistas en campo con datos móviles limitados.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const CaptureForm = lazy(() => import('./pages/CaptureForm'));
const CalendarPage = lazy(() => import('./pages/CalendarPage'));
const ReportsList = lazy(() => import('./pages/ReportsList'));
const UserManagement = lazy(() => import('./pages/UserManagement'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const PeoplePage = lazy(() => import('./pages/PeoplePage'));
const ElectoralPage = lazy(() => import('./pages/ElectoralPage'));
const BrigadasPage = lazy(() => import('./pages/BrigadasPage'));
const AuditPage = lazy(() => import('./pages/AuditPage'));
const EstructuraPage = lazy(() => import('./pages/EstructuraPage'));
const CalidadPage = lazy(() => import('./pages/CalidadPage'));
const CampoPage = lazy(() => import('./pages/CampoPage'));
const EncuestasPage = lazy(() => import('./pages/EncuestasPage'));
const MensajeriaPage = lazy(() => import('./pages/MensajeriaPage'));

const PageLoader: React.FC = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
    <i className="fas fa-circle-notch fa-spin" style={{ fontSize: 32, color: 'var(--color-primary)' }} />
  </div>
);

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
const ProtectedRoute: React.FC<{
  authenticated: boolean;
  allowed?: boolean;
  redirectTo?: string;
  children: React.ReactNode;
}> = ({ authenticated, allowed = true, redirectTo = '/', children }) => {
  if (!authenticated) return <Navigate to="/login" replace />;
  if (!allowed) return <Navigate to={redirectTo} replace />;
  return <>{children}</>;
};

// ---------------------------------------------------------------------------
// Inner app — needs useAuth which must live inside QueryClientProvider
// ---------------------------------------------------------------------------
const AppInner: React.FC = () => {
  const { user, isAuthenticated, isLoading, can, login, logout } = useAuth();

  // Mientras se revalida la sesión guardada, no se decide ninguna ruta:
  // hacerlo antes mandaría al login a un usuario que sí tiene sesión válida.
  if (isLoading) return <PageLoader />;

  // Cada quien aterriza donde su rol tiene algo que hacer.
  const home = can(4) ? '/' : '/capture';

  return (
    <ConfigProvider>
      <Router>
        <Layout user={user} onLogout={logout}>
          <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route
              path="/login"
              element={!isAuthenticated ? <Login onLogin={login} /> : <Navigate to={home} replace />}
            />

            {/* Tablero: coordinación seccional hacia arriba */}
            <Route path="/" element={
              <ProtectedRoute authenticated={isAuthenticated}>
                {can(4) ? <Dashboard /> : <Navigate to="/capture" replace />}
              </ProtectedRoute>
            } />

            {/* Captura y consulta: cualquier usuario con sesión */}
            <Route path="/capture" element={
              <ProtectedRoute authenticated={isAuthenticated}><CaptureForm /></ProtectedRoute>
            } />
            <Route path="/reports" element={
              <ProtectedRoute authenticated={isAuthenticated}><ReportsList /></ProtectedRoute>
            } />
            <Route path="/calendar" element={
              <ProtectedRoute authenticated={isAuthenticated}><CalendarPage /></ProtectedRoute>
            } />
            <Route path="/people" element={
              <ProtectedRoute authenticated={isAuthenticated}><PeoplePage /></ProtectedRoute>
            } />

            {/* Inteligencia y brigadas: coordinación seccional hacia arriba */}
            <Route path="/electoral" element={
              <ProtectedRoute authenticated={isAuthenticated} allowed={can(4)} redirectTo={home}>
                <ElectoralPage />
              </ProtectedRoute>
            } />
            <Route path="/brigadas" element={
              <ProtectedRoute authenticated={isAuthenticated} allowed={can(4)} redirectTo={home}>
                <BrigadasPage />
              </ProtectedRoute>
            } />

            {/* Red de promoción: la ve el promotor para su propia rama */}
            <Route path="/estructura" element={
              <ProtectedRoute authenticated={isAuthenticated} allowed={can(5)} redirectTo={home}>
                <EstructuraPage />
              </ProtectedRoute>
            } />

            {/* Calidad del padrón: mide a los capturistas, no la ven ellos */}
            <Route path="/calidad" element={
              <ProtectedRoute authenticated={isAuthenticated} allowed={can(3)} redirectTo={home}>
                <CalidadPage />
              </ProtectedRoute>
            } />

            {/* Campo: brigadas y jornadas — las usa quien sale a territorio */}
            <Route path="/campo" element={
              <ProtectedRoute authenticated={isAuthenticated} allowed={can(6)} redirectTo={home}>
                <CampoPage />
              </ProtectedRoute>
            } />

            {/* Encuestas: aplicarlas es trabajo de campo */}
            <Route path="/encuestas" element={
              <ProtectedRoute authenticated={isAuthenticated} allowed={can(6)} redirectTo={home}>
                <EncuestasPage />
              </ProtectedRoute>
            } />

            {/* Mensajería: acción externa, reservada a coordinación */}
            <Route path="/mensajeria" element={
              <ProtectedRoute authenticated={isAuthenticated} allowed={can(3)} redirectTo={home}>
                <MensajeriaPage />
              </ProtectedRoute>
            } />

            {/* Usuarios: coordinación municipal hacia arriba */}
            <Route path="/users" element={
              <ProtectedRoute authenticated={isAuthenticated} allowed={can(3)} redirectTo={home}>
                <UserManagement />
              </ProtectedRoute>
            } />

            {/* Bitácora y configuración: dirección de campaña */}
            <Route path="/bitacora" element={
              <ProtectedRoute authenticated={isAuthenticated} allowed={can(2)} redirectTo={home}>
                <AuditPage />
              </ProtectedRoute>
            } />
            <Route path="/configuracion" element={
              <ProtectedRoute authenticated={isAuthenticated} allowed={can(2)} redirectTo={home}>
                <SettingsPage />
              </ProtectedRoute>
            } />

            <Route path="*" element={<Navigate to={home} replace />} />
          </Routes>
          </Suspense>
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