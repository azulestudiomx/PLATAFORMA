import React, { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
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
import { User, UserRole } from './types';

// Helper component for protected routes
const ProtectedRoute: React.FC<{ user: User | null; children: React.ReactNode }> = ({ user, children }) => {
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);

  // Check for persisted session
  useEffect(() => {
    const savedUser = localStorage.getItem('user_session');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
  }, []);

  const handleLogin = (userData: User) => {
    setUser(userData);
    localStorage.setItem('user_session', JSON.stringify(userData));
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('user_session');
  };

  return (
    <ConfigProvider>
      <Router>
        <Layout user={user} onLogout={handleLogout}>
          <Routes>
            {/* Public Route */}
            <Route path="/login" element={!user ? <Login onLogin={handleLogin} /> : <Navigate to="/" replace />} />

            {/* Protected Routes */}
            <Route path="/" element={
              <ProtectedRoute user={user}>
                {user?.role === UserRole.ADMIN ? <Dashboard /> : <Navigate to="/capture" replace />}
              </ProtectedRoute>
            } />

            <Route path="/capture" element={
              <ProtectedRoute user={user}>
                <CaptureForm />
              </ProtectedRoute>
            } />

            <Route path="/reports" element={
              <ProtectedRoute user={user}>
                <ReportsList />
              </ProtectedRoute>
            } />

            <Route path="/calendar" element={
              <ProtectedRoute user={user}>
                <CalendarPage />
              </ProtectedRoute>
            } />

            <Route path="/users" element={
              <ProtectedRoute user={user}>
                {user?.role === UserRole.ADMIN ? <UserManagement /> : <Navigate to="/" replace />}
              </ProtectedRoute>
            } />

            <Route path="/configuracion" element={
              <ProtectedRoute user={user}>
                {user?.role === UserRole.ADMIN ? <SettingsPage /> : <Navigate to="/" replace />}
              </ProtectedRoute>
            } />

            <Route path="/people" element={
              <ProtectedRoute user={user}>
                {(user?.role === UserRole.ADMIN || user?.role === UserRole.CAPTURIST) ? <PeoplePage /> : <Navigate to="/" replace />}
              </ProtectedRoute>
            } />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </Router>
    </ConfigProvider>
  );
};

export default App;