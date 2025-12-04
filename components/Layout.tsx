import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { User, UserRole } from '../types';
import { useSyncReports } from '../services/syncHook';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface LayoutProps {
  children: React.ReactNode;
  user: User | null;
  onLogout: () => void;
}

const Layout: React.FC<LayoutProps> = ({ children, user, onLogout }) => {
  const location = useLocation();
  const { isOnline, pendingCount, isSyncing, syncReports } = useSyncReports();
  const { isInstallable, install } = usePWAInstall();

  if (!user) {
    return <>{children}</>;
  }

  const navItems = [
    { path: '/', label: 'Dashboard', icon: 'fa-chart-pie', roles: [UserRole.ADMIN] },
    { path: '/capture', label: 'Captura', icon: 'fa-camera', roles: [UserRole.ADMIN, UserRole.CAPTURIST] },
    { path: '/people', label: 'Padrón', icon: 'fa-address-book', roles: [UserRole.ADMIN, UserRole.CAPTURIST] },
    { path: '/reports', label: 'Expedientes', icon: 'fa-folder-open', roles: [UserRole.ADMIN, UserRole.CAPTURIST] },
    { path: '/calendar', label: 'Calendario', icon: 'fa-calendar-alt', roles: [UserRole.ADMIN, UserRole.CAPTURIST] },
    { path: '/users', label: 'Usuarios', icon: 'fa-users', roles: [UserRole.ADMIN] },
    { path: '/configuracion', label: 'Configuración', icon: 'fa-cog', roles: [UserRole.ADMIN] },
  ];

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-brand-primary text-white flex-col hidden md:flex shadow-xl z-20">
        <div className="p-6 text-center border-b border-red-900">
          <h1 className="text-2xl font-bold tracking-wider leading-none">PLATAFORMA<br /><span className="text-brand-accent">CIUDADANA</span></h1>
          <p className="text-xs text-gray-300 mt-2">CAMPECHE</p>
        </div>

        <nav className="flex-1 py-6">
          <ul className="space-y-1">
            {navItems.filter(item => item.roles.includes(user.role)).map((item) => (
              <li key={item.path}>
                <Link
                  to={item.path}
                  className={`flex items-center px-6 py-3 transition-colors ${location.pathname === item.path
                    ? 'bg-red-900 border-r-4 border-brand-accent text-white'
                    : 'text-gray-100 hover:bg-red-800'
                    }`}
                >
                  <i className={`fas ${item.icon} w-6`}></i>
                  <span className="font-medium">{item.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="p-4 bg-red-900">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-white text-brand-primary flex items-center justify-center font-bold">
              {user.name.charAt(0)}
            </div>
            <div>
              <p className="text-sm font-bold text-white">{user.name}</p>
              <p className="text-xs text-gray-300">{user.role}</p>
            </div>
          </div>
        </div>
        <div className="p-4 border-t border-red-900">
          {isInstallable && (
            <button
              onClick={install}
              className="w-full bg-white/10 hover:bg-white/20 text-white p-3 rounded-lg flex items-center gap-3 transition-colors mb-2"
            >
              <i className="fas fa-download w-5"></i>
              <span>Instalar App</span>
            </button>
          )}
          <button
            onClick={onLogout}
            className="w-full bg-red-900 hover:bg-red-800 text-white p-3 rounded-lg flex items-center gap-3 transition-colors"
          >
            <i className="fas fa-sign-out-alt w-5"></i>
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </aside>

      {/* Mobile Header & Content */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Top Header */}
        <header className="bg-white shadow-sm h-16 flex items-center justify-between px-6 z-10">
          <div className="md:hidden text-brand-primary font-bold text-xl">
            PLATAFORMA CAMPECHE
          </div>

          <div className="flex-1 flex justify-end items-center gap-4">
            {/* Sync Status Indicator */}
            <div className="flex items-center gap-3">
              {/* Online/Offline Badge */}
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-colors duration-300 ${isOnline
                ? 'bg-green-100 text-green-700 border border-green-200'
                : 'bg-gray-100 text-gray-600 border border-gray-200'
                }`}>
                <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-gray-400'
                  }`}></div>
                {isOnline ? 'EN LÍNEA' : 'OFFLINE'}
              </div>

              {/* Syncing / Pending Badge */}
              {isSyncing ? (
                <div className="flex items-center gap-2 text-xs font-bold bg-blue-50 text-blue-600 px-3 py-1.5 rounded-full border border-blue-100">
                  <i className="fas fa-sync fa-spin text-blue-500"></i>
                  <span>Sincronizando...</span>
                </div>
              ) : (
                <button
                  onClick={() => pendingCount > 0 && syncReports()}
                  disabled={pendingCount === 0}
                  className={`flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-full border transition-colors ${pendingCount > 0
                    ? 'bg-orange-50 text-orange-700 border-orange-100 hover:bg-orange-100 animate-pulse hover:animate-none cursor-pointer'
                    : 'bg-gray-50 text-gray-400 border-gray-200 cursor-default'
                    }`}
                  title={pendingCount > 0 ? "Clic para sincronizar ahora" : "No hay reportes pendientes"}
                >
                  <i className={`fas ${pendingCount > 0 ? 'fa-cloud-upload-alt' : 'fa-check-circle'}`}></i>
                  <span>{pendingCount > 0 ? `${pendingCount} pendientes (Subir)` : 'Sincronizado'}</span>
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Mobile Nav (Bottom) */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-brand-primary text-white flex justify-around py-3 z-30 shadow-[0_-2px_10px_rgba(0,0,0,0.1)]">
          {navItems.filter(item => item.roles.includes(user.role)).map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`flex flex-col items-center ${location.pathname === item.path ? 'text-brand-accent' : 'text-gray-300'}`}
            >
              <i className={`fas ${item.icon} text-lg mb-1`}></i>
              <span className="text-[10px]">{item.label}</span>
            </Link>
          ))}
          <button onClick={onLogout} className="flex flex-col items-center text-gray-300">
            <i className="fas fa-sign-out-alt text-lg mb-1"></i>
            <span className="text-[10px]">Salir</span>
          </button>
        </div>

        {/* Main Content Scrollable Area */}
        <main className="flex-1 overflow-auto p-4 md:p-8 pb-20 md:pb-8 bg-gray-50">
          {/* PWA Install Banner for Mobile */}
          {isInstallable && (
            <div className="md:hidden bg-brand-primary text-white p-4 rounded-xl shadow-lg mb-6 flex items-center justify-between animate-pulse">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-2 rounded-full">
                  <i className="fas fa-download text-xl"></i>
                </div>
                <div>
                  <p className="font-bold text-sm">Instalar Aplicación</p>
                  <p className="text-xs text-gray-200">Acceso rápido y sin internet</p>
                </div>
              </div>
              <button
                onClick={install}
                className="bg-white text-brand-primary px-4 py-2 rounded-lg text-xs font-bold shadow-sm hover:bg-gray-100 transition-colors"
              >
                INSTALAR
              </button>
            </div>
          )}

          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;