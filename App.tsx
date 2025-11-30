import React, { useState } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import CaptureForm from './pages/CaptureForm';
import CalendarPage from './pages/CalendarPage';
import ReportsList from './pages/ReportsList';
import Login from './pages/Login';
import UserManagement from './pages/UserManagement';
import { User, UserRole } from './types';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);

  const handleLogin = (newUser: User) => {
    setUser(newUser);
  };

  const handleLogout = () => {
    setUser(null);
  };

  return (
    <HashRouter>
      <Layout user={user} onLogout={handleLogout}>
        <Routes>
          {/* Public Route */}
          <Route path="/login" element={
            !user ? <Login onLogin={handleLogin} /> : <Navigate to="/" replace />
          } />

          {/* Protected Routes */}
          <Route path="/" element={
            user ? (
              user.role === UserRole.ADMIN ? <Dashboard /> : <Navigate to="/captura" replace />
            ) : <Navigate to="/login" replace />
          } />

          <Route path="/captura" element={
            user ? <CaptureForm /> : <Navigate to="/login" replace />
          } />

          <Route path="/expedientes" element={
            user ? <ReportsList /> : <Navigate to="/login" replace />
          } />

          <Route path="/calendario" element={
            user ? <CalendarPage /> : <Navigate to="/login" replace />
          } />

          <Route path="/usuarios" element={
            user ? (
              user.role === UserRole.ADMIN ? <UserManagement /> : <Navigate to="/" replace />
            ) : <Navigate to="/login" replace />
          } />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </HashRouter>
  );
};

export default App;